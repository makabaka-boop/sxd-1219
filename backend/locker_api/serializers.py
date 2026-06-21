from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import LockerGroup, Locker, Reservation

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


class ReservationSerializer(serializers.ModelSerializer):
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    user_info = UserSerializer(source='user', read_only=True)
    locker_info = LockerSerializer(source='locker', read_only=True)
    cleaned_by_info = UserSerializer(source='cleaned_by', read_only=True)

    class Meta:
        model = Reservation
        fields = ['id', 'user', 'user_info', 'locker', 'locker_info', 'start_time',
                  'end_time', 'purpose', 'status', 'status_display', 'cleaned',
                  'cleaned_by', 'cleaned_by_info', 'cleaned_at', 'clean_note',
                  'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at', 'user']

    def validate(self, data):
        if 'start_time' in data and 'end_time' in data:
            if data['start_time'] >= data['end_time']:
                raise serializers.ValidationError('结束时间必须晚于开始时间')
        return data
