import { CartItem } from '../types';

/**
 * Validate an Indian mobile phone number.
 * Accepts optional +91 / 0 prefix followed by 10 digits starting with 6-9.
 */
export const validatePhone = (phone: string): boolean => {
  const cleaned = phone.replace(/\s+/g, '');
  return /^(?:\+91|0)?[6-9]\d{9}$/.test(cleaned);
};

/**
 * Validate an email address (basic RFC-style check).
 */
export const validateEmail = (email: string): boolean => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
};

/**
 * Validate the student signup form.
 * Returns an error message string if invalid, or null if valid.
 */
export const validateSignupForm = ({
  name,
  roll_number,
  phone,
}: {
  name: string;
  roll_number: string;
  phone: string;
}): string | null => {
  if (!name || name.trim().length < 2) {
    return 'Name must be at least 2 characters long.';
  }
  if (name.trim().length > 100) {
    return 'Name must not exceed 100 characters.';
  }
  if (!roll_number || roll_number.trim().length === 0) {
    return 'Roll number is required.';
  }
  if (roll_number.trim().length > 20) {
    return 'Roll number must not exceed 20 characters.';
  }
  if (!phone || phone.trim().length === 0) {
    return 'Phone number is required.';
  }
  if (!validatePhone(phone)) {
    return 'Please enter a valid Indian mobile number (10 digits starting with 6-9).';
  }
  return null;
};

/**
 * Validate the login form identifier (roll number or phone).
 * Returns an error message string if invalid, or null if valid.
 */
export const validateLoginForm = (identifier: string): string | null => {
  if (!identifier || identifier.trim().length === 0) {
    return 'Please enter your roll number or phone number.';
  }
  if (identifier.trim().length < 3) {
    return 'Identifier must be at least 3 characters.';
  }
  return null;
};

/**
 * Validate cart items before placing an order.
 * Returns an error message string if invalid, or null if valid.
 */
export const validateOrderItems = (items: CartItem[]): string | null => {
  if (!items || items.length === 0) {
    return 'Your cart is empty. Please add items before placing an order.';
  }
  for (const item of items) {
    if (item.quantity < 1) {
      return `Invalid quantity for item "${item.name}".`;
    }
    if (item.price < 0) {
      return `Invalid price for item "${item.name}".`;
    }
  }
  return null;
};
