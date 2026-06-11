# =============================================================================
# Smart Grocery AI — Terraform variables
# =============================================================================

variable "aws_region" {
  description = "AWS region (Singapore by default)"
  type        = string
  default     = "ap-southeast-1"
}

variable "project" {
  description = "Project slug used to name resources"
  type        = string
  default     = "smart-grocery"
}

variable "environment" {
  description = "Environment name (staging | production)"
  type        = string
  default     = "production"
}

# ---- Networking -------------------------------------------------------------

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

# ---- EKS ---------------------------------------------------------------------

variable "cluster_name" {
  description = "EKS cluster name"
  type        = string
  default     = "smart-grocery"
}

variable "cluster_version" {
  description = "Kubernetes version for the EKS cluster"
  type        = string
  default     = "1.30"
}

variable "node_instance_types" {
  description = "Instance types for the managed node group"
  type        = list(string)
  default     = ["t3.large"]
}

variable "node_group_min_size" {
  description = "Minimum number of worker nodes"
  type        = number
  default     = 2
}

variable "node_group_max_size" {
  description = "Maximum number of worker nodes"
  type        = number
  default     = 5
}

variable "node_group_desired_size" {
  description = "Desired number of worker nodes"
  type        = number
  default     = 2
}

# ---- RDS (PostgreSQL 16) ------------------------------------------------------

variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t4g.medium"
}

variable "db_name" {
  description = "Initial database name"
  type        = string
  default     = "smart_grocery"
}

variable "db_username" {
  description = "Master username for PostgreSQL"
  type        = string
  default     = "grocery"
}

variable "db_allocated_storage" {
  description = "Initial storage in GB"
  type        = number
  default     = 50
}

variable "db_max_allocated_storage" {
  description = "Storage autoscaling ceiling in GB"
  type        = number
  default     = 200
}

variable "db_multi_az" {
  description = "Enable Multi-AZ for RDS (enable for production HA)"
  type        = bool
  default     = false
}

variable "db_backup_retention_days" {
  description = "Automated backup retention in days"
  type        = number
  default     = 7
}

variable "db_deletion_protection" {
  description = "Protect the database from accidental deletion"
  type        = bool
  default     = true
}

# ---- ElastiCache (Redis) -------------------------------------------------------

variable "redis_node_type" {
  description = "ElastiCache node type"
  type        = string
  default     = "cache.t4g.micro"
}

variable "redis_num_nodes" {
  description = "Number of Redis cache nodes (1 = no replica)"
  type        = number
  default     = 1
}

# ---- S3 / CloudFront -----------------------------------------------------------

variable "uploads_bucket_name" {
  description = "Globally-unique S3 bucket name for user uploads (receipts, recipe scans)"
  type        = string
  default     = "smart-grocery-uploads-prod"
}

variable "app_domain" {
  description = "Public web app domain (used for S3 CORS and DNS)"
  type        = string
  default     = "app.example.sg"
}

variable "api_domain" {
  description = "Public API domain (used for DNS)"
  type        = string
  default     = "api.example.sg"
}

# ---- ECR ------------------------------------------------------------------------

variable "ecr_keep_last_images" {
  description = "Number of images to retain per ECR repository"
  type        = number
  default     = 20
}

# ---- DNS (optional) ---------------------------------------------------------------

variable "create_dns" {
  description = "Whether to create the Route53 zone and records"
  type        = bool
  default     = false
}

variable "route53_zone_name" {
  description = "Route53 hosted zone name (e.g. example.sg)"
  type        = string
  default     = "example.sg"
}

variable "alb_name" {
  description = "Name of the ALB created by the AWS Load Balancer Controller (for DNS alias lookup). Set after the ingress exists."
  type        = string
  default     = ""
}
