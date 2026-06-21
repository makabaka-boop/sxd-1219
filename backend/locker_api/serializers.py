from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import LockerGroup, Locker, Reservation, ReservationChangeHistory, RenewalApplication

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    role_display = serializers.CharField(source='get_role_display', read_only=True)

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'role', 'role_display', 'phone', 'first_name', 'last_name']
        read_only_fields = ['id']


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=4)

    class Meta:
        model = User
        fields = ['username', 'password', 'email', 'phone']

    def create(self, validated_data):
        user = User.objects.create_user(
            username=validated_data['username'],
            password=validated_data['password'],
            email=validated_data.get('email', ''),
            phone=validated_data.get('phone', ''),
            role='user',
        )
        return user


class LockerGroupSerializer(serializers.ModelSerializer):
    locker_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = LockerGroup
        fields = ['id', 'name', 'location', 'description', 'locker_count', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']


class LockerSerializer(serializers.ModelSerializer):
    size_display = serializers.CharField(source='get_size_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    group_name = serializers.CharField(source='locker_group.name', read_only=True)

    class Meta:
        model = Locker
        fields = ['id', 'locker_group', 'group_name', 'code', 'size', 'size_display',
                  'status', 'status_display', 'description', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']


class ReservationChangeHistorySerializer(serializers.ModelSerializer):
    change_type_display = serializers.CharField(source='get_change_type_display', read_only=True)
    changed_by_info = UserSerializer(source='changed_by', read_only=True)

    class Meta:
        model = ReservationChangeHistory
        fields = ['id', 'reservation', 'changed_by', 'changed_by_info', 'change_type', 'change_type_display',
                  'original_locker', 'original_locker_code', 'new_locker', 'new_locker_code',
                  'original_start_time', 'original_end_time', 'new_start_time', 'new_end_time',
                  'change_reason', 'created_at']
        read_only_fields = ['id', 'created_at']


class RescheduleRequestSerializer(serializers.Serializer):
    locker = serializers.IntegerField(required=False, help_text='目标柜格ID，更换柜格时必填')
    start_time = serializers.DateTimeField(required=False, help_text='新的开始时间')
    end_time = serializers.DateTimeField(required=False, help_text='新的结束时间')
    change_reason = serializers.CharField(required=False, allow_blank=True, max_length=500, help_text='改签原因')

    def validate(self, data):
        if not data.get('locker') and not data.get('start_time') and not data.get('end_time'):
            raise serializers.ValidationError('请至少修改柜格或预约时间')
        if (data.get('start_time') and not data.get('end_time')) or (not data.get('start_time') and data.get('end_time')):
            raise serializers.ValidationError('开始时间和结束时间必须同时提供')
        if data.get('start_time') and data.get('end_time'):
            if data['start_time'] >= data['end_time']:
                raise serializers.ValidationError('结束时间必须晚于开始时间')
        return data


class CheckAvailabilityRequestSerializer(serializers.Serializer):
    locker = serializers.IntegerField(required=True, help_text='柜格ID')
    start_time = serializers.DateTimeField(required=True, help_text='开始时间')
    end_time = serializers.DateTimeField(required=True, help_text='结束时间')
    exclude_reservation = serializers.IntegerField(required=False, help_text='排除的预约ID，用于改签时排除自身')


class ReservationSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    user_info = UserSerializer(source='user', read_only=True)
    locker_info = LockerSerializer(source='locker', read_only=True)
    cleaned_by_info = UserSerializer(source='cleaned_by', read_only=True)
    renewal_applications = serializers.SerializerMethodField()
    change_histories = serializers.SerializerMethodField()

    class Meta:
        model = Reservation
        fields = ['id', 'user', 'user_info', 'locker', 'locker_info', 'start_time',
                  'end_time', 'purpose', 'status', 'status_display', 'cleaned',
                  'cleaned_by', 'cleaned_by_info', 'cleaned_at', 'clean_note',
                  'is_changed', 'change_count', 'renewal_applications',
                  'change_histories', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at', 'user', 'is_changed', 'change_count']

    def get_renewal_applications(self, obj):
        apps = obj.renewal_applications.all().select_related('user', 'reviewer').order_by('-created_at')
        return RenewalApplicationBriefSerializer(apps, many=True).data

    def get_change_histories(self, obj):
        histories = obj.change_histories.all().select_related('changed_by').order_by('-created_at')
        return ReservationChangeHistorySerializer(histories, many=True).data

    def validate(self, data):
        if 'start_time' in data and 'end_time' in data:
            if data['start_time'] >= data['end_time']:
                raise serializers.ValidationError('结束时间必须晚于开始时间')
        return data


class RenewalApplicationBriefSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    user_info = UserSerializer(source='user', read_only=True)
    reviewer_info = UserSerializer(source='reviewer', read_only=True)

    class Meta:
        model = RenewalApplication
        fields = ['id', 'reservation', 'user', 'user_info', 'original_end_time',
                  'requested_end_time', 'reason', 'status', 'status_display',
                  'reviewer', 'reviewer_info', 'reviewed_at', 'review_note',
                  'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at', 'user', 'original_end_time',
                            'status', 'reviewer', 'reviewed_at']


class RenewalApplicationSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    user_info = UserSerializer(source='user', read_only=True)
    reviewer_info = UserSerializer(source='reviewer', read_only=True)
    reservation_info = ReservationSerializer(source='reservation', read_only=True)

    class Meta:
        model = RenewalApplication
        fields = ['id', 'reservation', 'reservation_info', 'user', 'user_info',
                  'original_end_time', 'requested_end_time', 'reason', 'status',
                  'status_display', 'reviewer', 'reviewer_info', 'reviewed_at',
                  'review_note', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at', 'user', 'original_end_time',
                            'status', 'reviewer', 'reviewed_at']
