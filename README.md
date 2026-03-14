# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

## Deployment Configuration

This project is deployed to **GitHub Pages** using GitHub Actions. The custom domain is managed in **AWS Route 53** via Terraform.

### Required GitHub Secrets

Configure these in **Settings > Secrets and variables > Actions**:

| Secret Name | Description | Example |
| :--- | :--- | :--- |
| `AWS_ROLE_ARN` | IAM role for Terraform to manage Route 53. | `arn:aws:iam::...:role/deployer` |
| `AWS_REGION` | AWS region for the Terraform backend. | `eu-west-1` |
| `DOMAIN_NAME` | Your custom subdomain. | `list.albertmoreno.dev` |
| `HOSTED_ZONE_ID` | Route 53 Hosted Zone ID. | `Z1234567890ABC` |

### AWS IAM Role Setup (for Terraform)

Terraform needs permissions to manage Route 53 records and the remote backend.

**Permissions Policy:**
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "route53:GetHostedZone",
                "route53:ListResourceRecordSets",
                "route53:ChangeResourceRecordSets",
                "route53:GetChange",
                "s3:*",
                "dynamodb:*"
            ],
            "Resource": "*"
        }
    ]
}
```

*Note: S3/DynamoDB permissions are for the Terraform Remote Backend.*

## Infrastructure Setup (Terraform)

### ⚠️ Remote Backend
You **must** configure a remote backend in `terraform/main.tf` so GitHub Actions can track the state of your Route 53 records.

```hcl
terraform {
  backend "s3" {
    bucket         = "your-tf-state-bucket"
    key            = "p2p-list/terraform.tfstate"
    region         = "eu-west-1"
  }
}
```

## GitHub Pages Setup

1.  **Deploy once:** Push to `main` to trigger the first deployment. This will create the `gh-pages` branch.
2.  **Enable Pages:** Go to **Settings > Pages**.
    *   **Build and deployment > Source**: Deploy from a branch.
    *   **Branch**: `gh-pages` / `/ (root)`.
3.  **Custom Domain:** The workflow automatically creates a `CNAME` file. Ensure "Custom domain" in settings matches your `DOMAIN_NAME`.
4.  **HTTPS:** GitHub will automatically provision an SSL certificate for your subdomain once the DNS propagates.
