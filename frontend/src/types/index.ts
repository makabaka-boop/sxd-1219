export interface User {
  id: number;
  username: string;
  email: string;
  role: 'admin' | 'user';
  role_display: string;
  phone?: string;
  first_name?: string;
  last_name?: string;
}

export interface LockerGroup {
  id: number;
  name: string;
  location: string;
  description?: string;
  locker_count: number;
  created_at: string;
  updated_at: string;
}

export type LockerSize = 'small' | 'medium' | 'large';
export type LockerStatus = 'available' | 'reserved' | 'in_use' | 'pending_clean' | 'paused';

export interface Locker {
  id: number;
  locker_group: number;
  group_name: string;
  code: string;
  size: LockerSize;
  size_display: string;
  status: LockerStatus;
  status_display: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

export type ReservationStatus = 'pending' | 'active' | 'completed' | 'cancelled';

export type RenewalStatus = 'pending' | 'approved' | 'rejected';

export interface RenewalApplication {
  id: number;
  reservation: number;
  reservation_info?: Reservation;
  user: number;
  user_info: User;
  original_end_time: string;
  requested_end_time: string;
  reason: string;
  status: RenewalStatus;
  status_display: string;
  reviewer?: number;
  reviewer_info?: User;
  reviewed_at?: string;
  review_note?: string;
  created_at: string;
  updated_at: string;
}

export interface Reservation {
  id: number;
  user: number;
  user_info: User;
  locker: number;
  locker_info: Locker;
  start_time: string;
  end_time: string;
  purpose?: string;
  status: ReservationStatus;
  status_display: string;
  cleaned: boolean;
  cleaned_by?: number;
  cleaned_by_info?: User;
  cleaned_at?: string;
  clean_note?: string;
  renewal_applications?: RenewalApplication[];
  created_at: string;
  updated_at: string;
}

export interface Stats {
  total_lockers: number;
  available_lockers: number;
  reserved_lockers: number;
  in_use_lockers: number;
  pending_clean_lockers: number;
  paused_lockers: number;
  total_reservations: number;
  pending_reservations: number;
  active_reservations: number;
  completed_reservations: number;
  pending_clean_reservations: number;
  total_groups: number;
  total_users: number;
  pending_renewals: number;
  approved_renewals: number;
  rejected_renewals: number;
}

export interface AuthResponse {
  user: User;
  access: string;
  refresh: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface RegisterRequest {
  username: string;
  password: string;
  email?: string;
  phone?: string;
  role?: 'admin' | 'user';
}

export interface CreateReservationRequest {
  locker: number;
  start_time: string;
  end_time: string;
  purpose?: string;
}

export interface CreateRenewalRequest {
  reservation: number;
  requested_end_time: string;
  reason: string;
}

export interface ReviewRenewalRequest {
  review_note?: string;
}

export interface WithdrawRenewalRequest {
  review_note?: string;
}
