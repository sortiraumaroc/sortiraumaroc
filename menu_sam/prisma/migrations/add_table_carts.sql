-- Create table_carts table for temporary cart storage before order submission
CREATE TABLE IF NOT EXISTS table_carts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  place_id INT NOT NULL,
  table_number INT NOT NULL,
  menu_item_id INT NOT NULL,
  session_id VARCHAR(255) NOT NULL,
  first_name VARCHAR(255),
  quantity INT NOT NULL DEFAULT 1,
  price DECIMAL(25, 2) NOT NULL,
  comment VARCHAR(400),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (place_id) REFERENCES place(place_id) ON DELETE CASCADE,
  FOREIGN KEY (menu_item_id) REFERENCES menu_item(menu_item_id) ON DELETE CASCADE,
  
  INDEX idx_place_table (place_id, table_number),
  INDEX idx_session_id (session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
