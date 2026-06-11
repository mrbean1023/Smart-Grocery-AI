# =============================================================================
# Route53 — optional DNS (set create_dns = true and alb_name after the
# AWS Load Balancer Controller has created the ALB for the ingress).
# =============================================================================

resource "aws_route53_zone" "main" {
  count = var.create_dns ? 1 : 0
  name  = var.route53_zone_name
}

# The ALB is created out-of-band by the AWS Load Balancer Controller from the
# k8s Ingress; look it up by name once it exists (e.g. from the ingress group).
data "aws_lb" "ingress" {
  count = var.create_dns && var.alb_name != "" ? 1 : 0
  name  = var.alb_name
}

resource "aws_route53_record" "app" {
  count   = var.create_dns && var.alb_name != "" ? 1 : 0
  zone_id = aws_route53_zone.main[0].zone_id
  name    = var.app_domain
  type    = "A"

  alias {
    name                   = data.aws_lb.ingress[0].dns_name
    zone_id                = data.aws_lb.ingress[0].zone_id
    evaluate_target_health = true
  }
}

resource "aws_route53_record" "api" {
  count   = var.create_dns && var.alb_name != "" ? 1 : 0
  zone_id = aws_route53_zone.main[0].zone_id
  name    = var.api_domain
  type    = "A"

  alias {
    name                   = data.aws_lb.ingress[0].dns_name
    zone_id                = data.aws_lb.ingress[0].zone_id
    evaluate_target_health = true
  }
}
