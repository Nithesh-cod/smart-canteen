-- ============================================================================
-- SMART CANTEEN - PostgreSQL Database Schema
-- ============================================================================
-- Version: 1.0
-- Database: PostgreSQL 14+
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Students Table
CREATE TABLE students (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    roll_number VARCHAR(50) UNIQUE NOT NULL,
    phone VARCHAR(15) UNIQUE NOT NULL,
    email VARCHAR(255),
    department VARCHAR(100),
    points INTEGER DEFAULT 0 CHECK (points >= 0),
    total_spent DECIMAL(10, 2) DEFAULT 0 CHECK (total_spent >= 0),
    total_orders INTEGER DEFAULT 0 CHECK (total_orders >= 0),
    tier VARCHAR(20) DEFAULT 'Bronze' CHECK (tier IN ('Bronze', 'Silver', 'Gold', 'Platinum')),
    profile_image_url TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    last_login TIMESTAMP
);

CREATE INDEX idx_students_roll ON students(roll_number);
CREATE INDEX idx_students_phone ON students(phone);

-- Menu Items Table
CREATE TABLE menu_items (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(50) NOT NULL CHECK (category IN ('starters', 'mains', 'desserts', 'beverages')),
    price DECIMAL(8, 2) NOT NULL CHECK (price > 0),
    image_url TEXT,
    is_available BOOLEAN DEFAULT true,
    rating DECIMAL(3, 2) DEFAULT 4.0 CHECK (rating >= 0 AND rating <= 5),
    preparation_time INTEGER DEFAULT 10,
    is_vegetarian BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_menu_available ON menu_items(is_available);
CREATE INDEX idx_menu_category ON menu_items(category);

-- Orders Table  
CREATE TABLE orders (
    id BIGSERIAL PRIMARY KEY,
    student_id UUID REFERENCES students(id) ON DELETE SET NULL,
    order_number VARCHAR(50) UNIQUE NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'preparing', 'ready', 'completed', 'cancelled')),
    total_amount DECIMAL(10, 2) NOT NULL CHECK (total_amount >= 0),
    original_amount DECIMAL(10, 2),
    points_used INTEGER DEFAULT 0 CHECK (points_used >= 0),
    points_earned INTEGER DEFAULT 0 CHECK (points_earned >= 0),
    payment_status VARCHAR(20) DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded')),
    payment_method VARCHAR(50),
    razorpay_order_id VARCHAR(255),
    razorpay_payment_id VARCHAR(255),
    razorpay_signature VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP
);

CREATE INDEX idx_orders_student ON orders(student_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created ON orders(created_at DESC);

-- Order Items Table
CREATE TABLE order_items (
    id SERIAL PRIMARY KEY,
    order_id BIGINT REFERENCES orders(id) ON DELETE CASCADE,
    menu_item_id INTEGER REFERENCES menu_items(id),
    item_name VARCHAR(255) NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    price DECIMAL(8, 2) NOT NULL CHECK (price >= 0)
);

CREATE INDEX idx_order_items_order ON order_items(order_id);

-- Favorites Table
CREATE TABLE favorites (
    id SERIAL PRIMARY KEY,
    student_id UUID REFERENCES students(id) ON DELETE CASCADE,
    menu_item_id INTEGER REFERENCES menu_items(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(student_id, menu_item_id)
);

CREATE INDEX idx_favorites_student ON favorites(student_id);

-- Offers Table
CREATE TABLE offers (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    discount_percentage DECIMAL(5, 2),
    discount_amount DECIMAL(8, 2),
    min_order_amount DECIMAL(8, 2) DEFAULT 0,
    valid_from TIMESTAMP,
    valid_until TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_students_updated_at BEFORE UPDATE ON students
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_menu_items_updated_at BEFORE UPDATE ON menu_items
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Sample Data
INSERT INTO menu_items (name, description, category, price, image_url, rating, is_vegetarian) VALUES
('Paneer Tikka', 'Grilled cottage cheese with spices', 'starters', 120, 'https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?w=400', 4.5, true),
('Chicken Biryani', 'Aromatic rice with chicken', 'mains', 180, 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=400', 4.8, false),
('Veg Fried Rice', 'Chinese style fried rice', 'mains', 140, 'https://images.unsplash.com/photo-1512058564366-18510be2db19?w=400', 4.3, true),
('Gulab Jamun', 'Sweet milk dumplings', 'desserts', 60, 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=400', 4.7, true),
('Cold Coffee', 'Chilled coffee drink', 'beverages', 80, 'https://images.unsplash.com/photo-1517487881594-2787fef5ebf7?w=400', 4.6, true),
('Spring Rolls', 'Crispy vegetable rolls', 'starters', 100, 'https://images.unsplash.com/photo-1541529086526-db283c563270?w=400', 4.4, true),
('Masala Dosa', 'South Indian crepe', 'mains', 90, 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=400', 4.6, true),
('Samosa', 'Indian pastry', 'starters', 40, 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=400', 4.5, true),
('Masala Chai', 'Spiced Indian tea', 'beverages', 20, 'https://images.unsplash.com/photo-1563822249366-3a0c9a14c8cf?w=400', 4.8, true),
('Chocolate Brownie', 'Rich chocolate dessert', 'desserts', 70, 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=400', 4.7, true);