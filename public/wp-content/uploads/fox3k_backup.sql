-- MySQL dump 10.19  Distrib 10.5.19-MariaDB, for debian-linux-gnu (x86_64)
-- Host: localhost    Database: fox3k_wp
-- ------------------------------------------------------
-- Server version	10.5.19-MariaDB-1

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Table structure for table `wp_users`
--

DROP TABLE IF EXISTS `wp_users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `wp_users` (
  `ID` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `user_login` varchar(60) NOT NULL DEFAULT '',
  `user_pass` varchar(255) NOT NULL DEFAULT '',
  `user_email` varchar(100) NOT NULL DEFAULT '',
  `user_status` int(11) NOT NULL DEFAULT 0,
  PRIMARY KEY (`ID`)
) AUTO_INCREMENT=3;

--
-- Dumping data for table `wp_users`
--

LOCK TABLES `wp_users` WRITE;
INSERT INTO `wp_users` VALUES (1,'admin','$P$BYpKx2XoQ6nQqW9zYz6nQqW9zYz6nQqW9zYz6/','admin@fox3000foxy.com',0),(2,'Fox3000foxy','$P$BhS3tL7kZ2mX8vQ4rP1sN9wD5gJ0bM2nV7cB3xQ/','fox3000foxy@fox3000foxy.com',0);
UNLOCK TABLES;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
