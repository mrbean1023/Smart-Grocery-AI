# =============================================================================
# RDS — PostgreSQL 16
# pgvector note: no custom parameter group is required. pgvector ships with
# RDS PostgreSQL 16; the application enables it per-database with
# `CREATE EXTENSION IF NOT EXISTS vector;` (Prisma migration handles this).
# =============================================================================

resource "random_password" "db" {
  length  = 32
  special = false
}

resource "aws_secretsmanager_secret" "db" {
  name        = "${local.name}/database"
  description = "PostgreSQL credentials and connection URL for ${local.name}"
}

resource "aws_secretsmanager_secret_version" "db" {
  secret_id = aws_secretsmanager_secret.db.id
  secret_string = jsonencode({
    username     = var.db_username
    password     = random_password.db.result
    host         = aws_db_instance.postgres.address
    port         = aws_db_instance.postgres.port
    dbname       = var.db_name
    DATABASE_URL = "postgresql://${var.db_username}:${random_password.db.result}@${aws_db_instance.postgres.address}:${aws_db_instance.postgres.port}/${var.db_name}?schema=public"
  })
}

resource "aws_db_subnet_group" "postgres" {
  name       = "${local.name}-db"
  subnet_ids = module.vpc.private_subnets
}

resource "aws_security_group" "postgres" {
  name        = "${local.name}-postgres"
  description = "Allow PostgreSQL from EKS worker nodes"
  vpc_id      = module.vpc.vpc_id

  ingress {
    description     = "PostgreSQL from EKS nodes"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [module.eks.node_security_group_id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_db_instance" "postgres" {
  identifier = "${local.name}-postgres"

  engine         = "postgres"
  engine_version = "16"
  instance_class = var.db_instance_class

  db_name  = var.db_name
  username = var.db_username
  password = random_password.db.result

  allocated_storage     = var.db_allocated_storage
  max_allocated_storage = var.db_max_allocated_storage
  storage_type          = "gp3"
  storage_encrypted     = true

  multi_az            = var.db_multi_az
  deletion_protection = var.db_deletion_protection

  backup_retention_period = var.db_backup_retention_days
  backup_window           = "18:00-19:00" # 02:00-03:00 SGT
  maintenance_window      = "Sun:19:00-Sun:20:00"

  db_subnet_group_name   = aws_db_subnet_group.postgres.name
  vpc_security_group_ids = [aws_security_group.postgres.id]
  publicly_accessible    = false

  performance_insights_enabled = true
  auto_minor_version_upgrade   = true

  skip_final_snapshot       = false
  final_snapshot_identifier = "${local.name}-postgres-final"
}
