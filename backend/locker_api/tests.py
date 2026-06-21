from django.test import TestCase
from django.contrib.auth import get_user_model
from django.utils import timezone
from datetime import timedelta
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from .models import LockerGroup, Locker, Reservation, ReservationChangeHistory

User = get_user_model()


class ReservationRescheduleTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        self.user = User.objects.create_user(
            username='testuser',
            password='testpass123',
            email='test@example.com',
            role='user'
        )
        self.admin = User.objects.create_user(
            username='admin',
            password='adminpass123',
            email='admin@example.com',
            role='admin'
        )

        self.group = LockerGroup.objects.create(
            name='测试柜组',
            location='测试位置'
        )

        self.locker1 = Locker.objects.create(
            locker_group=self.group,
            code='TEST001',
            size='medium',
            status='available'
        )
        self.locker2 = Locker.objects.create(
            locker_group=self.group,
            code='TEST002',
            size='medium',
            status='available'
        )

        now = timezone.now()
        self.start_time = now + timedelta(hours=1)
        self.end_time = now + timedelta(hours=3)

        self.reservation = Reservation.objects.create(
            user=self.user,
            locker=self.locker1,
            start_time=self.start_time,
            end_time=self.end_time,
            status='pending'
        )

        refresh = RefreshToken.for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {refresh.access_token}')

    def test_check_availability(self):
        params = {
            'locker': self.locker1.id,
            'start_time': self.start_time.isoformat(),
            'end_time': self.end_time.isoformat(),
        }
        response = self.client.get('/api/reservations/check_availability/', params)
        self.assertEqual(response.status_code, 200)
        self.assertIn('available', response.data)
        self.assertFalse(response.data['available'])
        self.assertTrue(response.data['conflict'])

        params['exclude_reservation'] = self.reservation.id
        response = self.client.get('/api/reservations/check_availability/', params)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['available'])
        self.assertFalse(response.data['conflict'])

    def test_available_lockers_in_group(self):
        params = {
            'group': self.group.id,
            'start_time': self.start_time.isoformat(),
            'end_time': self.end_time.isoformat(),
            'exclude_reservation': self.reservation.id,
        }
        response = self.client.get('/api/reservations/available_lockers_in_group/', params)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 2)

        params2 = {
            'group': self.group.id,
            'start_time': self.start_time.isoformat(),
            'end_time': self.end_time.isoformat(),
        }
        response2 = self.client.get('/api/reservations/available_lockers_in_group/', params2)
        self.assertEqual(response2.status_code, 200)
        self.assertEqual(len(response2.data), 1)

    def test_reschedule_change_time(self):
        new_start = self.start_time + timedelta(hours=2)
        new_end = self.end_time + timedelta(hours=2)

        data = {
            'start_time': new_start.isoformat(),
            'end_time': new_end.isoformat(),
            'change_reason': '时间调整测试',
        }
        response = self.client.post(
            f'/api/reservations/{self.reservation.id}/reschedule/',
            data,
            format='json'
        )
        self.assertEqual(response.status_code, 200)

        self.reservation.refresh_from_db()
        self.assertEqual(self.reservation.start_time.replace(tzinfo=None), new_start.replace(tzinfo=None))
        self.assertEqual(self.reservation.end_time.replace(tzinfo=None), new_end.replace(tzinfo=None))
        self.assertTrue(self.reservation.is_changed)
        self.assertEqual(self.reservation.change_count, 1)

        history = ReservationChangeHistory.objects.filter(reservation=self.reservation).first()
        self.assertIsNotNone(history)
        self.assertEqual(history.change_type, 'time')
        self.assertEqual(history.change_reason, '时间调整测试')

    def test_reschedule_change_locker(self):
        data = {
            'locker': self.locker2.id,
            'change_reason': '更换柜格测试',
        }
        response = self.client.post(
            f'/api/reservations/{self.reservation.id}/reschedule/',
            data,
            format='json'
        )
        self.assertEqual(response.status_code, 200)

        self.reservation.refresh_from_db()
        self.assertEqual(self.reservation.locker_id, self.locker2.id)
        self.assertTrue(self.reservation.is_changed)
        self.assertEqual(self.reservation.change_count, 1)

        history = ReservationChangeHistory.objects.filter(reservation=self.reservation).first()
        self.assertIsNotNone(history)
        self.assertEqual(history.change_type, 'locker')
        self.assertEqual(history.original_locker_code, self.locker1.code)
        self.assertEqual(history.new_locker_code, self.locker2.code)

    def test_reschedule_both_time_and_locker(self):
        new_start = self.start_time + timedelta(hours=1)
        new_end = self.end_time + timedelta(hours=1)

        data = {
            'locker': self.locker2.id,
            'start_time': new_start.isoformat(),
            'end_time': new_end.isoformat(),
            'change_reason': '同时修改时间和柜格',
        }
        response = self.client.post(
            f'/api/reservations/{self.reservation.id}/reschedule/',
            data,
            format='json'
        )
        self.assertEqual(response.status_code, 200)

        self.reservation.refresh_from_db()
        self.assertEqual(self.reservation.locker_id, self.locker2.id)
        self.assertEqual(self.reservation.start_time.replace(tzinfo=None), new_start.replace(tzinfo=None))
        self.assertTrue(self.reservation.is_changed)
        self.assertEqual(self.reservation.change_count, 1)

        history = ReservationChangeHistory.objects.filter(reservation=self.reservation).first()
        self.assertIsNotNone(history)
        self.assertEqual(history.change_type, 'both')

    def test_reschedule_active_reservation_fails(self):
        self.reservation.status = 'active'
        self.reservation.save()

        data = {
            'start_time': (self.start_time + timedelta(hours=1)).isoformat(),
            'end_time': (self.end_time + timedelta(hours=1)).isoformat(),
        }
        response = self.client.post(
            f'/api/reservations/{self.reservation.id}/reschedule/',
            data,
            format='json'
        )
        self.assertEqual(response.status_code, 400)

    def test_reschedule_with_conflict_fails(self):
        Reservation.objects.create(
            user=self.admin,
            locker=self.locker2,
            start_time=self.start_time,
            end_time=self.end_time,
            status='pending'
        )

        data = {
            'locker': self.locker2.id,
        }
        response = self.client.post(
            f'/api/reservations/{self.reservation.id}/reschedule/',
            data,
            format='json'
        )
        self.assertEqual(response.status_code, 400)

    def test_reschedule_no_changes_fails(self):
        data = {}
        response = self.client.post(
            f'/api/reservations/{self.reservation.id}/reschedule/',
            data,
            format='json'
        )
        self.assertEqual(response.status_code, 400)

    def test_reschedule_locker_status_updated(self):
        old_locker_status_before = self.locker1.status

        data = {
            'locker': self.locker2.id,
        }
        response = self.client.post(
            f'/api/reservations/{self.reservation.id}/reschedule/',
            data,
            format='json'
        )
        self.assertEqual(response.status_code, 200)

        self.locker1.refresh_from_db()
        self.locker2.refresh_from_db()

        self.assertEqual(self.locker1.status, 'available')
        self.assertEqual(self.locker2.status, 'reserved')

    def test_reservation_detail_includes_change_history(self):
        new_start = self.start_time + timedelta(hours=2)
        new_end = self.end_time + timedelta(hours=2)

        self.client.post(
            f'/api/reservations/{self.reservation.id}/reschedule/',
            {
                'start_time': new_start.isoformat(),
                'end_time': new_end.isoformat(),
            },
            format='json'
        )

        response = self.client.get(f'/api/reservations/{self.reservation.id}/')
        self.assertEqual(response.status_code, 200)
        self.assertIn('change_histories', response.data)
        self.assertEqual(len(response.data['change_histories']), 1)
        self.assertIn('is_changed', response.data)
        self.assertTrue(response.data['is_changed'])
        self.assertIn('change_count', response.data)
        self.assertEqual(response.data['change_count'], 1)
