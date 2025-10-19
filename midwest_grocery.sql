-- phpMyAdmin SQL Dump

-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Oct 15, 2025 at 11:26 AM
-- Server version: 10.4.32-MariaDB
-- PHP Version: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `midwest_grocery`
--

-- --------------------------------------------------------

--
-- Table structure for table `orders`
--

CREATE TABLE `orders` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `order_code` varchar(20) DEFAULT NULL,
  `name` varchar(120) NOT NULL,
  `contact` varchar(120) DEFAULT NULL,
  `address` text DEFAULT NULL,
  `status` enum('Pending','Processing','Completed') DEFAULT 'Pending',
  `type` enum('Online','In-Store') DEFAULT 'Online',
  `payment` enum('Cash','GCash') DEFAULT 'Cash',
  `ref` varchar(120) DEFAULT NULL,
  `totalPrice` decimal(10,2) NOT NULL DEFAULT 0.00,
  `discount` decimal(10,2) NOT NULL DEFAULT 0.00,
  `net_total` decimal(10,2) NOT NULL DEFAULT 0.00,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `orders`
--



-- --------------------------------------------------------

--
-- Table structure for table `order_items`
--

CREATE TABLE `order_items` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `order_id` int(11) NOT NULL,
  `product_id` int(11) NOT NULL,
  `quantity` int(11) NOT NULL,
  `unit_price` decimal(10,2) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `products`
--

CREATE TABLE `products` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `handle` varchar(191) DEFAULT NULL,
  `sku` varchar(191) DEFAULT NULL,
  `name` varchar(255) NOT NULL,
  `category` varchar(191) DEFAULT NULL,
  `description` text DEFAULT NULL,
  `image` varchar(255) DEFAULT NULL,
  `sold_by_weight` tinyint(1) DEFAULT 0,
  `option1_name` varchar(120) DEFAULT NULL,
  `option1_value` varchar(120) DEFAULT NULL,
  `option2_name` varchar(120) DEFAULT NULL,
  `option2_value` varchar(120) DEFAULT NULL,
  `option3_name` varchar(120) DEFAULT NULL,
  `option3_value` varchar(120) DEFAULT NULL,
  `cost` decimal(10,2) DEFAULT 0.00,
  `barcode` varchar(191) DEFAULT NULL,
  `included_sku` varchar(191) DEFAULT NULL,
  `included_qty` int(11) DEFAULT 0,
  `track_stock` tinyint(1) DEFAULT 1,
  `available_for_sale` tinyint(1) DEFAULT 1,
  `price` decimal(10,2) NOT NULL DEFAULT 0.00,
  `stock` int(11) NOT NULL DEFAULT 0,
  `low_stock_threshold` int(11) DEFAULT 5,
  `tax_label` varchar(120) DEFAULT NULL,
  `tax_rate` decimal(5,2) DEFAULT 0.00,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `products`
--


-- --------------------------------------------------------

--
-- Table structure for table `sales_daily_summary`
--

CREATE TABLE `sales_daily_summary` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `summary_date` date NOT NULL,
  `gross_sales` decimal(12,2) NOT NULL DEFAULT 0.00,
  `refunds` decimal(12,2) NOT NULL DEFAULT 0.00,
  `discounts` decimal(12,2) NOT NULL DEFAULT 0.00,
  `net_sales` decimal(12,2) NOT NULL DEFAULT 0.00,
  `cost_of_goods` decimal(12,2) NOT NULL DEFAULT 0.00,
  `gross_profit` decimal(12,2) NOT NULL DEFAULT 0.00,
  `margin_percent` decimal(6,2) NOT NULL DEFAULT 0.00,
  `taxes` decimal(12,2) NOT NULL DEFAULT 0.00,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `sales_daily_summary`
--

-- --------------------------------------------------------

--
-- Table structure for table `suppliers`
--

CREATE TABLE `suppliers` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(120) NOT NULL,
  `contact` varchar(120) DEFAULT NULL,
  `last_delivery` date DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Seed data for table `suppliers`
-- Note: Contact is set to 'nocontact'; last_delivery left NULL
--
INSERT INTO `suppliers` (`name`, `contact`, `last_delivery`) VALUES
('IPF', 'nocontact', NULL),
('Marlboro', 'nocontact', NULL),
('RGPI', 'nocontact', NULL),
('CPC', 'nocontact', NULL),
('JTI ', 'nocontact', NULL),
('Emperador', 'nocontact', NULL),
('Jedi', 'nocontact', NULL),
('GreatValue', 'nocontact', NULL),
('Lenamed', 'nocontact', NULL),
('Rupra', 'nocontact', NULL),
('Tapa', 'nocontact', NULL),
('Smithy', 'nocontact', NULL),
('Snap', 'nocontact', NULL),
('KK', 'nocontact', NULL),
('Gigi', 'nocontact', NULL),
('Decastro', 'nocontact', NULL),
('Rebisco', 'nocontact', NULL),
('Nutriline', 'nocontact', NULL),
('Kape Prow', 'nocontact', NULL),
('4ar', 'nocontact', NULL),
('Blissful'	, 'nocontact', NULL),
('Trek', 'nocontact', NULL),
('Selecta', 'nocontact', NULL),
('Gardenia', 'nocontact', NULL),
('Egg', 'nocontact', NULL),
('Consumer Plus', 'nocontact', NULL),
('Lustosa Fries', 'nocontact', NULL),
('Formosa', 'nocontact', NULL),
('Citimart', 'nocontact', NULL),
('Yakult', 'nocontact', NULL),
('Princeton', 'nocontact', NULL);

-- --------------------------------------------------------

--
-- Table structure for table `supplier_products`
--

CREATE TABLE `supplier_products` (
  `supplier_id` int(11) NOT NULL,
  `product_id` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `users`
--

CREATE TABLE `users` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `email` varchar(120) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `role` enum('admin','staff','customer') DEFAULT 'admin',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `users`
--

INSERT INTO `users` (`id`, `name`, `email`, `password_hash`, `role`, `created_at`) VALUES
(1, 'Admin', 'admin@midwest.local', '$2a$10$lBi86NbQf4sS2yU61APbgOBgAAl4utDJbUWgK/6iEIh9Gce9FytEa', 'admin', '2025-10-15 07:51:56');

--
-- Indexes for dumped tables
--

--
-- Indexes for table `orders`
--
-- Primary key already defined in CREATE TABLE
ALTER TABLE `orders`
  ADD UNIQUE KEY `order_code` (`order_code`);

--
-- Indexes for table `order_items`
--
-- Primary key already defined in CREATE TABLE
ALTER TABLE `order_items`
  ADD KEY `order_id` (`order_id`),
  ADD KEY `product_id` (`product_id`);

--
-- Indexes for table `products`
--
-- Primary key already defined in CREATE TABLE
ALTER TABLE `products`
  ADD UNIQUE KEY `handle` (`handle`);

--
-- Indexes for table `sales_daily_summary`
--
-- Primary key already defined in CREATE TABLE
ALTER TABLE `sales_daily_summary`
  ADD UNIQUE KEY `summary_date` (`summary_date`);

--
-- Indexes for table `suppliers`
--
-- Primary key already defined in CREATE TABLE for `suppliers`

--
-- Indexes for table `supplier_products`
--
ALTER TABLE `supplier_products`
  ADD PRIMARY KEY (`supplier_id`,`product_id`),
  ADD KEY `product_id` (`product_id`);

--
-- Indexes for table `users`
--
-- Primary key already defined in CREATE TABLE
ALTER TABLE `users`
  ADD UNIQUE KEY `email` (`email`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `orders`
--
ALTER TABLE `orders`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `order_items`
--
ALTER TABLE `order_items`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `products`
--
ALTER TABLE `products`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5568;

--
-- AUTO_INCREMENT for table `sales_daily_summary`
--
ALTER TABLE `sales_daily_summary`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=1332;

--
-- AUTO_INCREMENT for table `suppliers`
--
ALTER TABLE `suppliers`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `users`
--
ALTER TABLE `users`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `order_items`
--
ALTER TABLE `order_items`
  ADD CONSTRAINT `order_items_ibfk_1` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `order_items_ibfk_2` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`);

--
-- Constraints for table `supplier_products`
--
ALTER TABLE `supplier_products`
  ADD CONSTRAINT `supplier_products_ibfk_1` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `supplier_products_ibfk_2` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE;

--
-- Add image column to products table (for existing databases)
--
ALTER TABLE `products` ADD COLUMN `image` varchar(255) DEFAULT NULL AFTER `description`;

--
-- Add missing fields to orders table (for existing databases)
--
ALTER TABLE `orders` ADD COLUMN `contact` varchar(120) DEFAULT NULL AFTER `name`;
ALTER TABLE `orders` ADD COLUMN `address` text DEFAULT NULL AFTER `contact`;
ALTER TABLE `orders` CHANGE COLUMN `customer_name` `name` varchar(120) NOT NULL;
ALTER TABLE `orders` CHANGE COLUMN `total` `totalPrice` decimal(10,2) NOT NULL DEFAULT 0.00;

COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
