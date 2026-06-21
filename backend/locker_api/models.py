from django.db import models
from django.contrib.auth.models import AbstractUser


class User(AbstractUser):
    ROLE_ADMIN = 'admin'
    ROLE_USER = 'user'
    ROLE_CHOICES = [
        (ROLE_ADMIN, '管理员'),
        (ROLE_USER, '使用者'),
    ]
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default=ROLE_USER)
    phone = models.CharField(max_length=20, blank=True, null=True)

    class Meta:
        db_table = 'user'

    def __str__(self):
        return f'{self.username}({self.get_role_display()})'


class LockerGroup(models.Model):
    name = models.CharField(max_length=100, verbose_name='柜组名称')
    location = models.CharField(max_length=200, verbose_name='位置')
    description = models.TextField(blank=True, null=True, verbose_name='描述')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='创建时间')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='更新时间')

    class Meta:
        db_table = 'locker_group'
        verbose_name = '柜组'
        verbose_name_plural = '柜组'

    def __str__(self):
        return self.name


class Locker(models.Model):
    SIZE_SMALL = 'small'
    SIZE_MEDIUM = 'medium'
    SIZE_LARGE = 'large'
    SIZE_CHOICES = [
        (SIZE_SMALL, '小'),
        (SIZE_MEDIUM, '中'),
        (SIZE_LARGE, '大'),
    ]

    STATUS_AVAILABLE = 'available'
    STATUS_RESERVED = 'reserved'
    STATUS_IN_USE = 'in_use'
    STATUS_PENDING_CLEAN = 'pending_clean'
    STATUS_PAUSED = 'paused'
    STATUS_CHOICES = [
        (STATUS_AVAILABLE, '可预约'),
        (STATUS_RESERVED, '已预约'),
        (STATUS_IN_USE, '使用中'),
        (STATUS_PENDING_CLEAN, '待清理'),
        (STATUS_PAUSED, '暂停开放'),
    ]

    locker_group = models.ForeignKey(LockerGroup, on_delete=models.CASCADE, related_name='lockers', verbose_name='柜组')
    code = models.CharField(max_length=50, unique=True, verbose_name='柜格编号')
    size = models.CharField(max_length=20, choices=SIZE_CHOICES, default=SIZE_MEDIUM, verbose_name='尺寸')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_AVAILABLE, verbose_name='状态')
    description = models.TextField(blank=True, null=True, verbose_name='备注')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='创建时间')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='更新时间')

    class Meta:
        db_table = 'locker'
        verbose_name = '柜格'
        verbose_name_plural = '柜格'
        ordering = ['locker_group', 'code']

    def __str__(self):
        return f'{self.code}({self.get_size_display()})'


class Reservation(models.Model):
    STATUS_PENDING = 'pending'
    STATUS_ACTIVE = 'active'
    STATUS_COMPLETED = 'completed'
    STATUS_CANCELLED = 'cancelled'
    STATUS_CHOICES = [
        (STATUS_PENDING, '待使用'),
        (STATUS_ACTIVE, '使用中'),
        (STATUS_COMPLETED, '已完成'),
        (STATUS_CANCELLED, '已取消'),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='reservations', verbose_name='预约人')
    locker = models.ForeignKey(Locker, on_delete=models.CASCADE, related_name='reservations', verbose_name='柜格')
    start_time = models.DateTimeField(verbose_name='预约开始时间')
    end_time = models.DateTimeField(verbose_name='预约结束时间')
    purpose = models.TextField(blank=True, null=True, verbose_name='使用用途')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING, verbose_name='预约状态')
    cleaned = models.BooleanField(default=False, verbose_name='是否已清理')
    cleaned_by = models.ForeignKey(User, on_delete=models.SET_NULL, blank=True, null=True, related_name='cleaned_reservations', verbose_name='清理人')
    cleaned_at = models.DateTimeField(blank=True, null=True, verbose_name='清理时间')
    clean_note = models.TextField(blank=True, null=True, verbose_name='清理备注')
    created_at = models.DateTimeField(auto_now_add=True, verbose_name='创建时间')
    updated_at = models.DateTimeField(auto_now=True, verbose_name='更新时间')

    class Meta:
        db_table = 'reservation'
        verbose_name = '预约记录'
        verbose_name_plural = '预约记录'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.user.username} - {self.locker.code}'
