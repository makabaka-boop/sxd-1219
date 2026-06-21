from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

from .views import (
    RegisterView, LoginView, UserProfileView,
    LockerGroupViewSet, LockerViewSet, ReservationViewSet,
    RenewalApplicationViewSet, stats_view
)

router = DefaultRouter()
router.register(r'groups', LockerGroupViewSet, basename='group')
router.register(r'lockers', LockerViewSet, basename='locker')
router.register(r'reservations', ReservationViewSet, basename='reservation')
router.register(r'renewals', RenewalApplicationViewSet, basename='renewal')

urlpatterns = [
    path('auth/register/', RegisterView.as_view(), name='register'),
    path('auth/login/', LoginView.as_view(), name='login'),
    path('auth/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('auth/profile/', UserProfileView.as_view(), name='profile'),
    path('stats/', stats_view, name='stats'),
    path('', include(router.urls)),
]
