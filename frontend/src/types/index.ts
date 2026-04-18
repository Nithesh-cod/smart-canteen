export type Tier = 'Bronze' | 'Silver' | 'Gold' | 'Platinum';
export type OrderStatus = 'pending' | 'preparing' | 'ready' | 'completed' | 'cancelled';
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';
export type Category = 'starters' | 'mains' | 'desserts' | 'beverages';

export interface Student {
  id: string;
  name: string;
  roll_number: string;
  phone: string;
  email?: string;
  department?: string;
  points: number;
  total_spent: number;
  total_orders: number;
  tier: Tier;
  profile_image_url?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface MenuItem {
  id: number;
  name: string;
  description?: string;
  /** Free-form string — backend no longer enforces a fixed set of values. */
  category: string;
  price: number;
  image_url?: string;
  is_available: boolean;
  rating: number;
  preparation_time: number;
  is_vegetarian: boolean;
  /** -1 = unlimited stock; 0 = out of stock; >0 = tracked quantity */
  stock_quantity?: number;
  created_at?: string;
}

export interface OrderItem {
  id?: number;
  menu_item_id?: number;
  item_name: string;
  quantity: number;
  price: number;
}

export interface Order {
  id: number;
  student_id: string;
  order_number: string;
  status: OrderStatus;
  total_amount: number;
  original_amount: number;
  points_used: number;
  points_earned: number;
  payment_status: PaymentStatus;
  payment_method?: string;
  razorpay_order_id?: string;
  razorpay_payment_id?: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
  student_name?: string;
  student_roll?: string;
  student_phone?: string;
  items?: OrderItem[];
}

export interface CartItem {
  id: number;
  name: string;
  price: number;
  quantity: number;
  image_url?: string;
  is_vegetarian?: boolean;
}

export interface Offer {
  id: number;
  title: string;
  description: string;
  discount_percentage?: number;
  discount_amount?: number;
  min_order_amount?: number;
  valid_from: string;
  valid_until: string;
  is_active: boolean;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface DashboardStats {
  todayRevenue: number;
  weekRevenue: number;
  monthRevenue: number;
  todayOrders: number;
  pendingOrders: number;
  topItems: Array<{ item_name: string; order_count: number; total_revenue: number }>;
  recentOrders: Order[];
  tierDistribution: Array<{ tier: string; student_count: number }>;
}

export interface AuthState {
  currentStudent: Student | null;
  isAuthenticated: boolean;
  token: string | null;
  loading: boolean;
  error: string | null;
}

export interface MenuState {
  items: MenuItem[];
  loading: boolean;
  error: string | null;
  selectedCategory: string;
  searchQuery: string;
}

export interface CartState {
  items: CartItem[];
  pointsToRedeem: number;
  discount: number;
}

export interface OrderState {
  currentOrder: Order | null;
  orders: Order[];
  loading: boolean;
  error: string | null;
}
