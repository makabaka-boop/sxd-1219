from django.db.models import Q, Count
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import authenticate, get_user_model

from .models import LockerGroup, Locker, Reservation
from .serializers import (
    UserSerializer, RegisterSerializer,
    LockerGroupSerializer, LockerSerializer, ReservationSerializer
)
from .permissions import IsAdmin, IsAdminOrReadOnly, IsOwnerOrAdmin

User = get_user_model()


class RegisterView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.save()
            refresh = RefreshToken.for_user(user)
            return Response({
                'user': UserSerializer(user).data,
                'access': str(refresh.access_token),
                'refresh': str(refresh),
            }, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        username = request.data.get('username')
        password = request.data.get('password')
        user = authenticate(username=username, password=password)
        if user:
            refresh = RefreshToken.for_user(user)
            return Response({
                'user': UserSerializer(user).data,
                'access': str(refresh.access_token),
                'refresh': str(refresh),
            })
        return Response({'error': '用户名或密码错误'}, status=status.HTTP_401_UNAUTHORIZED)


class UserProfileView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)


class LockerGroupViewSet(viewsets.ModelViewSet):
    queryset = LockerGroup.objects.annotate(locker_count=Count('lockers'))
    serializer_class = LockerGroupSerializer
    permission_classes = [IsAdminOrReadOnly]


class LockerViewSet(viewsets.ModelViewSet):
    queryset = Locker.objects.select_related('locker_group').all()
    serializer_class = LockerSerializer
    permission_classes = [IsAdminOrReadOnly]

    def get_queryset(self):
        queryset = super().get_queryset()
        group_id = self.request.query_params.get('group')
        size = self.request.query_params.get('size')
        status = self.request.query_params.get('status')
        if group_id:
            queryset = queryset.filter(locker_group_id=group_id)
        if size:
            queryset = queryset.filter(size=size)
        if status:
            queryset = queryset.filter(status=status)
        return queryset

    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticated])
    def available(self, request):
        queryset = self.get_queryset().filter(status=Locker.STATUS_AVAILABLE)
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)


class ReservationViewSet(viewsets.ModelViewSet):
    queryset = Reservation.objects.select_related('user', 'locker', 'locker__locker_group', 'cleaned_by').all()
    serializer_class = ReservationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user
        if user.role != 'admin':
            queryset = queryset.filter(user=user)
        locker_id = self.request.query_params.get('locker')
        status = self.request.query_params.get('status')
        if locker_id:
            queryset = queryset.filter(locker_id=locker_id)
        if status:
            queryset = queryset.filter(status=status)
        return queryset

    def check_time_conflict(self, locker_id, start_time, end_time, exclude_id=None):
        conflicts = Reservation.objects.filter(
            locker_id=locker_id,
            status__in=[Reservation.STATUS_PENDING, Reservation.STATUS_ACTIVE]
        ).filter(
            Q(start_time__lt=end_time) & Q(end_time__gt=start_time)
        )
        if exclude_id:
            conflicts = conflicts.exclude(id=exclude_id)
        return conflicts.exists()

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        locker_id = serializer.validated_data['locker'].id
        start_time = serializer.validated_data['start_time']
        end_time = serializer.validated_data['end_time']

        locker = Locker.objects.get(id=locker_id)
        if locker.status == Locker.STATUS_PAUSED:
            return Response({'error': '该柜格已暂停开放，暂不可预约'}, status=status.HTTP_400_BAD_REQUEST)

        if self.check_time_conflict(locker_id, start_time, end_time):
            return Response({'error': '该柜格在该时间段已被预约'}, status=status.HTTP_400_BAD_REQUEST)

        reservation = serializer.save(user=request.user)
        self._update_locker_status(locker)

        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    def _update_locker_status(self, locker):
        now = timezone.now()
        active_count = Reservation.objects.filter(
            locker=locker,
            status__in=[Reservation.STATUS_PENDING, Reservation.STATUS_ACTIVE]
        ).count()
        if locker.status == Locker.STATUS_PAUSED:
            return
        if Reservation.objects.filter(
            locker=locker,
            status=Reservation.STATUS_ACTIVE,
            start_time__lte=now,
            end_time__gte=now
        ).exists():
            locker.status = Locker.STATUS_IN_USE
        elif Reservation.objects.filter(
            locker=locker,
            status=Reservation.STATUS_COMPLETED,
            cleaned=False
        ).exists():
            locker.status = Locker.STATUS_PENDING_CLEAN
        elif active_count > 0:
            locker.status = Locker.STATUS_RESERVED
        else:
            locker.status = Locker.STATUS_AVAILABLE
        locker.save()

    @action(detail=True, methods=['post'], permission_classes=[IsOwnerOrAdmin])
    def cancel(self, request, pk=None):
        reservation = self.get_object()
        if reservation.status not in [Reservation.STATUS_PENDING, Reservation.STATUS_ACTIVE]:
            return Response({'error': '该预约状态不可取消'}, status=status.HTTP_400_BAD_REQUEST)
        reservation.status = Reservation.STATUS_CANCELLED
        reservation.save()
        self._update_locker_status(reservation.locker)
        return Response(ReservationSerializer(reservation).data)

    @action(detail=True, methods=['post'], permission_classes=[IsOwnerOrAdmin])
    def confirm_use(self, request, pk=None):
        reservation = self.get_object()
        if reservation.status != Reservation.STATUS_PENDING:
            return Response({'error': '该预约状态不可确认使用'}, status=status.HTTP_400_BAD_REQUEST)
        reservation.status = Reservation.STATUS_ACTIVE
        reservation.save()
        self._update_locker_status(reservation.locker)
        return Response(ReservationSerializer(reservation).data)

    @action(detail=True, methods=['post'], permission_classes=[IsOwnerOrAdmin])
    def finish(self, request, pk=None):
        reservation = self.get_object()
        if reservation.status != Reservation.STATUS_ACTIVE:
            return Response({'error': '该预约状态不可结束'}, status=status.HTTP_400_BAD_REQUEST)
        reservation.status = Reservation.STATUS_COMPLETED
        reservation.save()
        self._update_locker_status(reservation.locker)
        return Response(ReservationSerializer(reservation).data)

    @action(detail=True, methods=['post'], permission_classes=[IsAdmin])
    def mark_cleaned(self, request, pk=None):
        reservation = self.get_object()
        if reservation.cleaned:
            return Response({'error': '该预约已标记为已清理'}, status=status.HTTP_400_BAD_REQUEST)
        reservation.cleaned = True
        reservation.cleaned_by = request.user
        reservation.cleaned_at = timezone.now()
        reservation.clean_note = request.data.get('clean_note', '')
        reservation.save()
        self._update_locker_status(reservation.locker)
        return Response(ReservationSerializer(reservation).data)


@api_view(['GET'])
@permission_classes([IsAdmin])
def stats_view(request):
    data = {
        'total_lockers': Locker.objects.count(),
        'available_lockers': Locker.objects.filter(status=Locker.STATUS_AVAILABLE).count(),
        'reserved_lockers': Locker.objects.filter(status=Locker.STATUS_RESERVED).count(),
        'in_use_lockers': Locker.objects.filter(status=Locker.STATUS_IN_USE).count(),
        'pending_clean_lockers': Locker.objects.filter(status=Locker.STATUS_PENDING_CLEAN).count(),
        'paused_lockers': Locker.objects.filter(status=Locker.STATUS_PAUSED).count(),
        'total_reservations': Reservation.objects.count(),
        'pending_reservations': Reservation.objects.filter(status=Reservation.STATUS_PENDING).count(),
        'active_reservations': Reservation.objects.filter(status=Reservation.STATUS_ACTIVE).count(),
        'completed_reservations': Reservation.objects.filter(status=Reservation.STATUS_COMPLETED).count(),
        'pending_clean_reservations': Reservation.objects.filter(
            status=Reservation.STATUS_COMPLETED, cleaned=False
        ).count(),
        'total_groups': LockerGroup.objects.count(),
        'total_users': User.objects.filter(role='user').count(),
    }
    return Response(data)
