# =============================================================================
# IAM — IRSA role for the API pod service account
# (namespace: smart-grocery / smart-grocery-staging / smart-grocery-prod,
#  service account: api — see infra/k8s/base/api-deployment.yaml)
# =============================================================================

data "aws_iam_policy_document" "api_irsa_assume" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    effect  = "Allow"

    principals {
      type        = "Federated"
      identifiers = [module.eks.oidc_provider_arn]
    }

    condition {
      test     = "StringEquals"
      variable = "${module.eks.oidc_provider}:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringLike"
      variable = "${module.eks.oidc_provider}:sub"
      # Allow the `api` service account in any smart-grocery* namespace
      values = ["system:serviceaccount:smart-grocery*:api"]
    }
  }
}

resource "aws_iam_role" "api_irsa" {
  name               = "${local.name}-api-irsa"
  assume_role_policy = data.aws_iam_policy_document.api_irsa_assume.json
}

data "aws_iam_policy_document" "api_permissions" {
  statement {
    sid    = "UploadsBucketRW"
    effect = "Allow"
    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:DeleteObject",
      "s3:ListBucket",
      "s3:AbortMultipartUpload",
    ]
    resources = [
      aws_s3_bucket.uploads.arn,
      "${aws_s3_bucket.uploads.arn}/*",
    ]
  }

  statement {
    sid    = "ReadAppSecrets"
    effect = "Allow"
    actions = [
      "secretsmanager:GetSecretValue",
      "secretsmanager:DescribeSecret",
    ]
    resources = [
      aws_secretsmanager_secret.db.arn,
      "arn:aws:secretsmanager:${var.aws_region}:${data.aws_caller_identity.current.account_id}:secret:${local.name}/*",
    ]
  }
}

resource "aws_iam_role_policy" "api_irsa" {
  name   = "${local.name}-api-permissions"
  role   = aws_iam_role.api_irsa.id
  policy = data.aws_iam_policy_document.api_permissions.json
}
