import os
import sys
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'locker_project.settings')
django.setup()

from django.contrib.auth import get_user_model
from locker_api.models import LockerGroup, Locker

User = get_user_model()


def init_data():
    admin_user, _ = User.objects.get_or_create(
        username='admin',
        defaults={
            'email': 'admin@example.com',
            'role': 'admin',
            'is_staff': True,
            'is_superuser': True,
        }
    )
    admin_user.set_password('admin123')
    admin_user.save()
    print(f'已创建管理员: admin / admin123')

    test_user, _ = User.objects.get_or_create(
        username='user1',
        defaults={
            'email': 'user1@example.com',
            'role': 'user',
        }
    )
    test_user.set_password('user123')
    test_user.save()
    print(f'已创建测试用户: user1 / user123')

    groups_data = [
        {'name': 'A区储物柜', 'location': '园区A栋1楼大厅', 'description': '面向A栋员工使用'},
        {'name': 'B区储物柜', 'location': '园区B栋2楼入口', 'description': '面向B栋员工使用'},
        {'name': '访客区储物柜', 'location': '园区主入口接待处', 'description': '面向访客临时使用'},
    ]

    sizes = ['small', 'medium', 'large']
    statuses = ['available', 'available', 'available', 'available', 'reserved', 'in_use', 'pending_clean', 'paused']

    for i, group_data in enumerate(groups_data):
        group, created = LockerGroup.objects.get_or_create(
            name=group_data['name'],
            defaults=group_data
        )
        if created:
            for j in range(12):
                Locker.objects.create(
                    locker_group=group,
                    code=f'{chr(65 + i)}{j + 1:02d}',
                    size=sizes[j % 3],
                    status=statuses[j % 8],
                )
            print(f'已创建柜组: {group.name} (12个柜格)')

    print('初始化完成!')


if __name__ == '__main__':
    init_data()
