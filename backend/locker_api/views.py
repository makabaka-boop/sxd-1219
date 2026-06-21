from django.db.models import Q, Count
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import authenticate, get_user_model

from .models import LockerGroup, Locker, Reservation, ReservationChangeHistory, RenewalApplication
from .serializers import (
    UserSerializer, RegisterSerializer,
    LockerGroupSerializer, LockerSerializer, ReservationSerializer,
    ReservationChangeHistorySerializer, RescheduleRequestSerializer,
    CheckAvailabilityRequestSerializer, RenewalApplicationSerializer
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

    @action(detail=True, methods=['get'], permission_classes=[IsAuthenticated])
    def recent_reservations(self, request, pk=None):
        locker = self.get_object()
        active_reservations = Reservation.objects.filter(
            locker=locker,
            status__in=[Reservation.STATUS_PENDING, Reservation.STATUS_ACTIVE]
        ).select_related(
            'user', 'locker', 'locker__locker_group', 'cleaned_by'
        ).order_by('start_time')
        serializer = ReservationSerializer(active_reservations, many=True)
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

    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticated])
    def check_availability(self, request):
        serializer = CheckAvailabilityRequestSerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)

        locker_id = serializer.validated_data['locker']
        start_time = serializer.validated_data['start_time']
        end_time = serializer.validated_data['end_time']
        exclude_id = serializer.validated_data.get('exclude_reservation')

        try:
            locker = Locker.objects.get(id=locker_id)
        except Locker.DoesNotExist:
            return Response({'error': '柜格不存在'}, status=status.HTTP_404_NOT_FOUND)

        if locker.status == Locker.STATUS_PAUSED:
            return Response({
                'available': False,
                'error': '该柜格已暂停开放，暂不可预约'
            })

        has_conflict = self.check_time_conflict(locker_id, start_time, end_time, exclude_id)

        return Response({
            'available': not has_conflict,
            'locker': locker_id,
            'start_time': start_time,
            'end_time': end_time,
            'conflict': has_conflict
        })

    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticated])
    def available_lockers_in_group(self, request):
        group_id = request.query_params.get('group')
        start_time = request.query_params.get('start_time')
        end_time = request.query_params.get('end_time')
        exclude_reservation = request.query_params.get('exclude_reservation')

        if not group_id:
            return Response({'error': '请指定柜组ID'}, status=status.HTTP_400_BAD_REQUEST)
        if not start_time or not end_time:
            return Response({'error': '请指定开始和结束时间'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            group = LockerGroup.objects.get(id=group_id)
        except LockerGroup.DoesNotExist:
            return Response({'error': '柜组不存在'}, status=status.HTTP_404_NOT_FOUND)

        lockers = Locker.objects.filter(
            locker_group=group,
            status__in=[Locker.STATUS_AVAILABLE, Locker.STATUS_RESERVED]
        ).select_related('locker_group')

        available_lockers = []
        for locker in lockers:
            if locker.status == Locker.STATUS_PAUSED:
                continue
            has_conflict = self.check_time_conflict(
                locker.id, start_time, end_time, exclude_reservation
            )
            if not has_conflict:
                available_lockers.append(locker)

        serializer = LockerSerializer(available_lockers, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'], permission_classes=[IsOwnerOrAdmin])
    def reschedule(self, request, pk=None):
        reservation = self.get_object()

        if reservation.status != Reservation.STATUS_PENDING:
            return Response({'error': '仅待使用的预约可改签'}, status=status.HTTP_400_BAD_REQUEST)

        if timezone.now() >= reservation.start_time:
            return Response({'error': '预约已开始，不可改签'}, status=status.HTTP_400_BAD_REQUEST)

        serializer = RescheduleRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        new_locker_id = serializer.validated_data.get('locker')
        new_start_time = serializer.validated_data.get('start_time')
        new_end_time = serializer.validated_data.get('end_time')
        change_reason = serializer.validated_data.get('change_reason', '')

        original_locker = reservation.locker
        original_start_time = reservation.start_time
        original_end_time = reservation.end_time

        target_locker_id = new_locker_id if new_locker_id else reservation.locker_id
        target_start_time = new_start_time if new_start_time else reservation.start_time
        target_end_time = new_end_time if new_end_time else reservation.end_time

        if new_locker_id:
            if new_locker_id == reservation.locker_id and not new_start_time:
                return Response({'error': '未做任何修改'}, status=status.HTTP_400_BAD_REQUEST)
            try:
                new_locker = Locker.objects.get(id=new_locker_id)
            except Locker.DoesNotExist:
                return Response({'error': '目标柜格不存在'}, status=status.HTTP_404_NOT_FOUND)

            if new_locker.locker_group_id != reservation.locker.locker_group_id:
                return Response({'error': '只能更换同柜组内的柜格'}, status=status.HTTP_400_BAD_REQUEST)

            if new_locker.status == Locker.STATUS_PAUSED:
                return Response({'error': '目标柜格已暂停开放'}, status=status.HTTP_400_BAD_REQUEST)
        else:
            new_locker = reservation.locker
            if not new_start_time:
                return Response({'error': '未做任何修改'}, status=status.HTTP_400_BAD_REQUEST)

        if self.check_time_conflict(target_locker_id, target_start_time, target_end_time, reservation.id):
            return Response({'error': '目标柜格在该时间段已被预约'}, status=status.HTTP_400_BAD_REQUEST)

        locker_changed = new_locker_id is not None and new_locker_id != reservation.locker_id
        time_changed = new_start_time is not None

        if locker_changed and time_changed:
            change_type = ReservationChangeHistory.CHANGE_TYPE_BOTH
        elif locker_changed:
            change_type = ReservationChangeHistory.CHANGE_TYPE_LOCKER
        else:
            change_type = ReservationChangeHistory.CHANGE_TYPE_TIME

        old_locker = reservation.locker

        reservation.locker = new_locker
        reservation.start_time = target_start_time
        reservation.end_time = target_end_time
        reservation.is_changed = True
        reservation.change_count += 1
        reservation.save()

        ReservationChangeHistory.objects.create(
            reservation=reservation,
            changed_by=request.user,
            change_type=change_type,
            original_locker=original_locker,
            original_locker_code=original_locker.code,
            new_locker=new_locker,
            new_locker_code=new_locker.code,
            original_start_time=original_start_time,
            original_end_time=original_end_time,
            new_start_time=target_start_time,
            new_end_time=target_end_time,
            change_reason=change_reason
        )

        if locker_changed:
            self._update_locker_status(old_locker)
        self._update_locker_status(new_locker)

        return Response(ReservationSerializer(reservation).data)


class RenewalApplicationViewSet(viewsets.ModelViewSet):
    queryset = RenewalApplication.objects.select_related(
        'reservation', 'reservation__locker', 'reservation__locker__locker_group',
        'reservation__user', 'user', 'reviewer'
    ).all()
    serializer_class = RenewalApplicationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = super().get_queryset()
        user = self.request.user
        if user.role != 'admin':
            queryset = queryset.filter(user=user)
        status_param = self.request.query_params.get('status')
        if status_param:
            queryset = queryset.filter(status=status_param)
        reservation_id = self.request.query_params.get('reservation')
        if reservation_id:
            queryset = queryset.filter(reservation_id=reservation_id)
        return queryset

    def check_renewal_conflict(self, reservation, requested_end_time):
        conflicts = Reservation.objects.filter(
            locker_id=reservation.locker_id,
            status__in=[Reservation.STATUS_PENDING, Reservation.STATUS_ACTIVE]
        ).filter(
            Q(start_time__lt=requested_end_time) & Q(end_time__gt=reservation.start_time)
        ).exclude(id=reservation.id)
        return conflicts.exists()

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        reservation = serializer.validated_data['reservation']
        requested_end_time = serializer.validated_data['requested_end_time']

        if request.user.role != 'admin' and reservation.user_id != request.user.id:
            return Response({'error': '只能对自己的预约申请续期'}, status=status.HTTP_400_BAD_REQUEST)

        if reservation.status != Reservation.STATUS_ACTIVE:
            return Response({'error': '仅使用中的预约可申请续期'}, status=status.HTTP_400_BAD_REQUEST)

        if RenewalApplication.objects.filter(
            reservation=reservation, status=RenewalApplication.STATUS_PENDING
        ).exists():
            return Response({'error': '该预约已有待审批的续期申请'}, status=status.HTTP_400_BAD_REQUEST)

        if requested_end_time <= reservation.end_time:
            return Response({'error': '续期时间必须晚于当前结束时间'}, status=status.HTTP_400_BAD_REQUEST)

        if self.check_renewal_conflict(reservation, requested_end_time):
            return Response({'error': '续期时间与该柜格后续预约冲突'}, status=status.HTTP_400_BAD_REQUEST)

        application = serializer.save(
            user=request.user,
            original_end_time=reservation.end_time,
        )
        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    @action(detail=True, methods=['post'], permission_classes=[IsAdmin])
    def approve(self, request, pk=None):
        application = self.get_object()
        if application.status != RenewalApplication.STATUS_PENDING:
            return Response({'error': '该申请已处理，不可重复审批'}, status=status.HTTP_400_BAD_REQUEST)

        reservation = application.reservation
        if reservation.status != Reservation.STATUS_ACTIVE:
            return Response({'error': '原预约已不在使用中，无法续期'}, status=status.HTTP_400_BAD_REQUEST)

        if self.check_renewal_conflict(reservation, application.requested_end_time):
            return Response({'error': '续期时间与该柜格后续预约冲突，审批失败'}, status=status.HTTP_400_BAD_REQUEST)

        reservation.end_time = application.requested_end_time
        reservation.save()

        application.status = RenewalApplication.STATUS_APPROVED
        application.reviewer = request.user
        application.reviewed_at = timezone.now()
        application.review_note = request.data.get('review_note', '')
        application.save()

        self._refresh_locker_status(reservation.locker)
        return Response(RenewalApplicationSerializer(application).data)

    @action(detail=True, methods=['post'], permission_classes=[IsAdmin])
    def reject(self, request, pk=None):
        application = self.get_object()
        if application.status != RenewalApplication.STATUS_PENDING:
            return Response({'error': '该申请已处理，不可重复审批'}, status=status.HTTP_400_BAD_REQUEST)

        review_note = request.data.get('review_note', '')
        if not review_note:
            return Response({'error': '拒绝时请填写拒绝原因'}, status=status.HTTP_400_BAD_REQUEST)

        application.status = RenewalApplication.STATUS_REJECTED
        application.reviewer = request.user
        application.reviewed_at = timezone.now()
        application.review_note = review_note
        application.save()
        return Response(RenewalApplicationSerializer(application).data)

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated])
    def withdraw(self, request, pk=None):
        application = self.get_object()
        if application.user_id != request.user.id and request.user.role != 'admin':
            return Response({'error': '无权限操作该申请'}, status=status.HTTP_403_FORBIDDEN)
        if application.status != RenewalApplication.STATUS_PENDING:
            return Response({'error': '仅待审批的申请可撤回'}, status=status.HTTP_400_BAD_REQUEST)

        application.status = RenewalApplication.STATUS_REJECTED
        application.reviewed_at = timezone.now()
        application.review_note = request.data.get('review_note', '用户主动撤回')
        application.save()
        return Response(RenewalApplicationSerializer(application).data)

    def update(self, request, *args, **kwargs):
        return Response(
            {'error': '续期申请不可直接修改，请撤回后重新提交'},
            status=status.HTTP_405_METHOD_NOT_ALLOWED
        )

    def partial_update(self, request, *args, **kwargs):
        return Response(
            {'error': '续期申请不可直接修改，请撤回后重新提交'},
            status=status.HTTP_405_METHOD_NOT_ALLOWED
        )

    def destroy(self, request, *args, **kwargs):
        return Response(
            {'error': '续期申请不可删除，如需取消请使用撤回功能'},
            status=status.HTTP_405_METHOD_NOT_ALLOWED
        )

    def _refresh_locker_status(self, locker):
        now = timezone.now()
        if locker.status == Locker.STATUS_PAUSED:
            return
        active_count = Reservation.objects.filter(
            locker=locker,
            status__in=[Reservation.STATUS_PENDING, Reservation.STATUS_ACTIVE]
        ).count()
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
        'pending_renewals': RenewalApplication.objects.filter(status=RenewalApplication.STATUS_PENDING).count(),
        'approved_renewals': RenewalApplication.objects.filter(status=RenewalApplication.STATUS_APPROVED).count(),
        'rejected_renewals': RenewalApplication.objects.filter(status=RenewalApplication.STATUS_REJECTED).count(),
    }
    return Response(data)
