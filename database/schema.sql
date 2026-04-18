-- ============================================================================
-- SMART CANTEEN — Full PostgreSQL Schema for Supabase
-- ============================================================================
-- Run this entire file in: Supabase Dashboard → SQL Editor → New Query → Run
-- It is safe to re-run (uses IF NOT EXISTS / DROP … IF EXISTS).
-- ============================================================================

-- ─── Extensions ──────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Drop tables in reverse dependency order (safe re-run) ───────────────────
DROP TABLE IF EXISTS favorites    CASCADE;
DROP TABLE IF EXISTS order_items  CASCADE;
DROP TABLE IF EXISTS orders       CASCADE;
DROP TABLE IF EXISTS menu_items   CASCADE;
DROP TABLE IF EXISTS students     CASCADE;
DROP TABLE IF EXISTS offers       CASCADE;

-- ============================================================================
-- STUDENTS
-- ============================================================================
CREATE TABLE students (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name             VARCHAR(255)  NOT NULL,
    roll_number      VARCHAR(50)   UNIQUE NOT NULL,
    phone            VARCHAR(15)   UNIQUE NOT NULL,
    email            VARCHAR(255),
    department       VARCHAR(100),
    points           INTEGER       DEFAULT 0  CHECK (points >= 0),
    total_spent      DECIMAL(10,2) DEFAULT 0  CHECK (total_spent >= 0),
    total_orders     INTEGER       DEFAULT 0  CHECK (total_orders >= 0),
    tier             VARCHAR(20)   DEFAULT 'Bronze'
                       CHECK (tier IN ('Bronze','Silver','Gold','Platinum')),
    profile_image_url TEXT,
    is_active        BOOLEAN       DEFAULT true,
    created_at       TIMESTAMPTZ   DEFAULT NOW(),
    updated_at       TIMESTAMPTZ   DEFAULT NOW(),
    last_login       TIMESTAMPTZ
);

CREATE INDEX idx_students_roll  ON students(roll_number);
CREATE INDEX idx_students_phone ON students(phone);

-- ============================================================================
-- MENU ITEMS
-- ============================================================================
-- NOTE: No category CHECK constraint — chef can use any string category.
CREATE TABLE menu_items (
    id               SERIAL PRIMARY KEY,
    name             VARCHAR(255)  NOT NULL,
    description      TEXT,
    category         VARCHAR(50)   NOT NULL,   -- free-form: starters/mains/desserts/beverages/...
    price            DECIMAL(8,2)  NOT NULL CHECK (price > 0),
    image_url        TEXT,
    is_available     BOOLEAN       DEFAULT true,
    rating           DECIMAL(3,2)  DEFAULT 4.0 CHECK (rating >= 0 AND rating <= 5),
    preparation_time INTEGER       DEFAULT 10,
    is_vegetarian    BOOLEAN       DEFAULT true,
    stock_quantity   INTEGER       DEFAULT -1,  -- -1 = unlimited; 0+ = tracked stock
    created_at       TIMESTAMPTZ   DEFAULT NOW(),
    updated_at       TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX idx_menu_available ON menu_items(is_available);
CREATE INDEX idx_menu_category  ON menu_items(category);

-- ============================================================================
-- ORDERS
-- ============================================================================
CREATE TABLE orders (
    id                  BIGSERIAL PRIMARY KEY,
    student_id          UUID         REFERENCES students(id) ON DELETE SET NULL,
    order_number        VARCHAR(50)  UNIQUE NOT NULL,
    status              VARCHAR(20)  DEFAULT 'pending'
                          CHECK (status IN ('pending','preparing','ready','completed','cancelled')),
    total_amount        DECIMAL(10,2) NOT NULL CHECK (total_amount >= 0),
    original_amount     DECIMAL(10,2),
    points_used         INTEGER       DEFAULT 0 CHECK (points_used >= 0),
    points_earned       INTEGER       DEFAULT 0 CHECK (points_earned >= 0),
    payment_status      VARCHAR(20)   DEFAULT 'pending'
                          CHECK (payment_status IN ('pending','paid','failed','refunded')),
    payment_method      VARCHAR(50),
    razorpay_order_id   VARCHAR(255),
    razorpay_payment_id VARCHAR(255),
    razorpay_signature  VARCHAR(255),
    -- Guest checkout fields (null for logged-in students)
    guest_name          VARCHAR(255),
    guest_phone         VARCHAR(20),
    guest_roll          VARCHAR(50),
    created_at          TIMESTAMPTZ   DEFAULT NOW(),
    updated_at          TIMESTAMPTZ   DEFAULT NOW(),
    completed_at        TIMESTAMPTZ
);

CREATE INDEX idx_orders_student ON orders(student_id);
CREATE INDEX idx_orders_status  ON orders(status);
CREATE INDEX idx_orders_created ON orders(created_at DESC);

-- ============================================================================
-- ORDER ITEMS
-- ============================================================================
CREATE TABLE order_items (
    id           SERIAL  PRIMARY KEY,
    order_id     BIGINT  REFERENCES orders(id) ON DELETE CASCADE,
    menu_item_id INTEGER REFERENCES menu_items(id) ON DELETE SET NULL,
    item_name    VARCHAR(255)  NOT NULL,
    quantity     INTEGER       NOT NULL CHECK (quantity > 0),
    price        DECIMAL(8,2)  NOT NULL CHECK (price >= 0)
);

CREATE INDEX idx_order_items_order ON order_items(order_id);

-- ============================================================================
-- FAVORITES
-- ============================================================================
CREATE TABLE favorites (
    id           SERIAL PRIMARY KEY,
    student_id   UUID    REFERENCES students(id)    ON DELETE CASCADE,
    menu_item_id INTEGER REFERENCES menu_items(id)  ON DELETE CASCADE,
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(student_id, menu_item_id)
);

CREATE INDEX idx_favorites_student ON favorites(student_id);

-- ============================================================================
-- OFFERS
-- ============================================================================
CREATE TABLE offers (
    id                  SERIAL PRIMARY KEY,
    title               VARCHAR(255)  NOT NULL,
    description         TEXT,
    discount_percentage DECIMAL(5,2),
    discount_amount     DECIMAL(8,2),
    min_order_amount    DECIMAL(8,2)  DEFAULT 0,
    valid_from          TIMESTAMPTZ,
    valid_until         TIMESTAMPTZ,
    is_active           BOOLEAN       DEFAULT true,
    created_at          TIMESTAMPTZ   DEFAULT NOW()
);

-- ============================================================================
-- TRIGGERS — auto-update updated_at
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_students_updated_at
    BEFORE UPDATE ON students
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_menu_items_updated_at
    BEFORE UPDATE ON menu_items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_orders_updated_at
    BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- SUPABASE REALTIME — subscribe orders, menu_items, students
-- ============================================================================
-- This lets the frontend receive live updates without polling.
ALTER PUBLICATION supabase_realtime ADD TABLE orders;
ALTER PUBLICATION supabase_realtime ADD TABLE menu_items;
ALTER PUBLICATION supabase_realtime ADD TABLE students;

-- ============================================================================
-- SAMPLE MENU DATA
-- ============================================================================
INSERT INTO menu_items (name, description, category, price, image_url, rating, is_vegetarian, preparation_time, stock_quantity) VALUES
('Paneer Tikka',      'Grilled cottage cheese with spices',     'starters',  120, 'https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?w=400', 4.5, true,  15, -1),
('Chicken Biryani',   'Aromatic basmati rice with chicken',     'mains',     180, 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=400', 4.8, false, 25, -1),
('Veg Fried Rice',    'Chinese style fried rice with veggies',  'mains',     140, 'https://images.unsplash.com/photo-1512058564366-18510be2db19?w=400', 4.3, true,  20, -1),
('Gulab Jamun',       'Sweet milk dumplings in sugar syrup',    'desserts',   60, 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=400', 4.7, true,   5, -1),
('Cold Coffee',       'Chilled blended coffee drink',           'beverages',  80, 'https://images.unsplash.com/photo-1517487881594-2787fef5ebf7?w=400', 4.6, true,   5, -1),
('Spring Rolls',      'Crispy golden vegetable rolls',          'starters',  100, 'https://images.unsplash.com/photo-1541529086526-db283c563270?w=400', 4.4, true,  10, -1),
('Masala Dosa',       'Crispy South Indian crepe with filling', 'mains',      90, 'https://images.unsplash.com/photo-1630383249896-424e482df921?w=400', 4.6, true,  15, -1),
('Samosa',            'Crispy pastry stuffed with spiced potato','starters',  40, 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=400', 4.5, true,   5, -1),
('Masala Chai',       'Classic spiced Indian tea',              'beverages',  20, 'https://images.unsplash.com/photo-1564890369478-c89ca6d9cde9?w=400', 4.8, true,   5, -1),
('Chocolate Brownie', 'Rich fudgy chocolate brownie',           'desserts',   70, 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=400', 4.7, true,  10, -1),
('Veg Burger',        'Crispy veggie patty with fresh toppings','mains',     110, 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400', 4.2, true,  15, -1),
('Fresh Lime Soda',   'Chilled lime with soda and mint',        'beverages',  40, 'https://images.unsplash.com/photo-1570831739435-6601aa3fa4fb?w=400', 4.5, true,   5, -1);
