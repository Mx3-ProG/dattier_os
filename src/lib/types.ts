import type { Actor } from "./auth/session";
export type Restaurant = {
  id: string;
  name: string;
  address: string;
  phone: string;
  goal: number;
};
export type MenuItem = {
  id: string;
  name: string;
  category: string;
  price: number;
  station: string;
  description: string;
  enabled: boolean;
  portions: number;
  archived_at: string | null;
  cost?: number;
};
export type Ingredient = {
  id: string;
  name: string;
  unit: string;
  physical: number;
  reserved: number;
  available: number;
  threshold: number;
};
export type Lot = {
  id: string;
  name: string;
  unit: string;
  quantity: number;
  reserved: number;
  expires_on: string;
  location: string;
};
export type Item = {
  id: string;
  order_id: string;
  name: string;
  price: number;
  quantity: number;
  station: string;
  status: string;
  note: string;
  material_cost?: number;
};
export type Order = {
  payment_amount: number | null;
  discount: number | null;
  id: string;
  status: string;
  channel: string;
  created_at: string;
  table_number: number | null;
  session_id: string | null;
  customer_name: string;
  contact?: string;
  items: Item[];
};
export type Reservation = {
  id: string;
  name: string;
  contact: string;
  guests: number;
  starts_at: string;
  ends_at: string;
  table_id: string | null;
  status: string;
  note: string;
};
export type Table = {
  id: string;
  number: number;
  capacity: number;
  status: string;
};
export type Event = {
  id: string;
  action: string;
  name: string;
  created_at: string;
  object_id: string | null;
};
export type Notice = {
  id: string;
  message: string;
  created_at: string;
  read: boolean;
  type: string;
  priority: "low" | "normal" | "high" | "critical";
  module: string | null;
  object_id: string | null;
};
export type Supplier = {
  id: string;
  name: string;
  contact: string;
  lead_days: number;
};
export type Purchase = {
  id: string;
  name: string;
  ingredient_id: string;
  ingredient_name: string;
  unit: string;
  quantity: number;
  received: number;
  due_on: string;
  status: string;
};
export type Shift = {
  id: string;
  name: string;
  profile_id: string;
  starts_at: string;
  ends_at: string;
};
export type StockMovement = {
  id: string;
  name: string;
  quantity: number;
  type: string;
  reason: string;
  created_at: string;
  reference: string;
};
export type Customer = {
  id: string;
  name: string;
  contact: string;
  consent: boolean;
  points: number;
};
export type Expense = {
  id: string;
  label: string;
  amount: number;
  created_at: string;
};
export type RecipeLine = {
  menu_id: string;
  ingredient_id: string;
  name: string;
  quantity: number;
  unit: string;
};
export type Promo = {
  id: string;
  customer_id: string;
  customer_name: string;
  code: string;
  kind: "percent" | "fixed";
  value: number;
  points_cost: number;
  expires_on: string;
  status: string;
  token: string;
  expired: boolean;
};
export type Snapshot = {
  promos: Promo[];
  checkoutCustomers: { id: string; name: string }[];
  now: string;
  user: Actor;
  restaurants: Restaurant[];
  restaurant: Restaurant;
  menu: MenuItem[];
  tables: Table[];
  orders: Order[];
  ingredients: Ingredient[];
  lots: Lot[];
  movements: StockMovement[];
  reservations: Reservation[];
  notifications: Notice[];
  unreadNotifications: number;
  notificationPreferences: { type: string; muted: boolean }[];
  audit: Event[];
  suppliers: Supplier[];
  purchases: Purchase[];
  employees: Actor[];
  shifts: Shift[];
  timeEntries: {
    id: string;
    name: string;
    event: string;
    created_at: string;
  }[];
  customers: Customer[];
  expenses: Expense[];
  recipes: RecipeLine[];
  sales: { day: string; total: number }[];
  payments: { amount: number; created_at: string }[];
};
