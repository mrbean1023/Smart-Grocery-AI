output "vpc_id" {
  description = "VPC id"
  value       = module.vpc.vpc_id
}

output "eks_cluster_name" {
  description = "EKS cluster name (use with aws eks update-kubeconfig)"
  value       = module.eks.cluster_name
}

output "eks_cluster_endpoint" {
  description = "EKS API server endpoint"
  value       = module.eks.cluster_endpoint
}

output "ecr_repository_urls" {
  description = "ECR repository URLs for api and web"
  value       = { for k, repo in aws_ecr_repository.app : k => repo.repository_url }
}

output "rds_endpoint" {
  description = "PostgreSQL endpoint"
  value       = aws_db_instance.postgres.endpoint
  sensitive   = true
}

output "db_secret_arn" {
  description = "Secrets Manager ARN holding DB credentials + DATABASE_URL"
  value       = aws_secretsmanager_secret.db.arn
}

output "redis_primary_endpoint" {
  description = "Redis primary endpoint"
  value       = aws_elasticache_replication_group.redis.primary_endpoint_address
  sensitive   = true
}

output "uploads_bucket" {
  description = "S3 uploads bucket name"
  value       = aws_s3_bucket.uploads.bucket
}

output "uploads_cdn_domain" {
  description = "CloudFront domain serving the uploads bucket"
  value       = aws_cloudfront_distribution.uploads.domain_name
}

output "api_irsa_role_arn" {
  description = "IAM role ARN to annotate on the api service account (eks.amazonaws.com/role-arn)"
  value       = aws_iam_role.api_irsa.arn
}

output "route53_name_servers" {
  description = "Zone name servers (when create_dns = true)"
  value       = var.create_dns ? aws_route53_zone.main[0].name_servers : []
}
