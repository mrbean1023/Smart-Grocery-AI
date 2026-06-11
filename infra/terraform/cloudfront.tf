# =============================================================================
# CloudFront — CDN in front of the uploads bucket (Origin Access Control).
# The web app itself is served by the ALB ingress; if you want CloudFront in
# front of the ALB too, add a second origin pointing at the ALB DNS name with
# a custom-origin config and an ACM cert in us-east-1 for the alias.
# =============================================================================

resource "aws_cloudfront_origin_access_control" "uploads" {
  name                              = "${local.name}-uploads-oac"
  description                       = "OAC for ${aws_s3_bucket.uploads.bucket}"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "uploads" {
  enabled = true
  comment = "${local.name} uploads CDN"

  # PriceClass_200 includes Asia-Pacific (Singapore) edge locations
  price_class = "PriceClass_200"

  origin {
    domain_name              = aws_s3_bucket.uploads.bucket_regional_domain_name
    origin_id                = "s3-uploads"
    origin_access_control_id = aws_cloudfront_origin_access_control.uploads.id
  }

  default_cache_behavior {
    target_origin_id       = "s3-uploads"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    # AWS managed cache policy: CachingOptimized
    cache_policy_id = "658327ea-f89d-4fab-a63d-7e88639e58f6"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}

# Allow only CloudFront (via OAC) to read from the bucket
data "aws_iam_policy_document" "uploads_cdn" {
  statement {
    sid       = "AllowCloudFrontRead"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.uploads.arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.uploads.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "uploads" {
  bucket = aws_s3_bucket.uploads.id
  policy = data.aws_iam_policy_document.uploads_cdn.json
}
