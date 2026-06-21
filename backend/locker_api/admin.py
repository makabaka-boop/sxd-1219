from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import User, LockerGroup, Locker, Reservation, ReservationChangeHistory


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ('username', 'email', 'role', 'is_staff')
    fieldsets = BaseUserAdmin.fieldsets + (
        ('角色信息', {'fields': ('role', 'phone')}),
    )


@admin.register(LockerGroup)
class LockerGroupAdmin(admin.ModelAdmin):
    list_display = ('name', 'location', 'created_at')
    search_fields = ('name', 'location')


@admin.register(Locker)
class LockerAdmin(admin.ModelAdmin):
    list_display = ('code', 'locker_group', 'size', 'status')
    list_filter = ('locker_group', 'size', 'status')
    search_fields = ('code',)


@admin.register(Reservation)
class ReservationAdmin(admin.ModelAdmin):
    list_display = ('user', 'locker', 'start_time', 'end_time', 'status', 'cleaned', 'is_changed', 'change_count')
    list_filter = ('status', 'cleaned', 'is_changed')
    search_fields = ('user__username', 'locker__code')
    readonly_fields = ('is_changed', 'change_count')


@admin.register(ReservationChangeHistory)
class ReservationChangeHistoryAdmin(admin.ModelAdmin):
    list_display = ('reservation', 'changed_by', 'change_type', 'original_locker_code', 'new_locker_code', 'created_at')
    list_filter = ('change_type',)
    search_fields = ('reservation__id', 'changed_by__username', 'original_locker_code', 'new_locker_code')
    readonly_fields = ('created_at',)
