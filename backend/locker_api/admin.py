from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import User, LockerGroup, Locker, Reservation


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
    list_display = ('user', 'locker', 'start_time', 'end_time', 'status', 'cleaned')
    list_filter = ('status', 'cleaned')
    search_fields = ('user__username', 'locker__code')
