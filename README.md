# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Deployment Configuration

This project is deployed to AWS via GitHub Actions using OIDC for secure, credential-less authentication.

### Required GitHub Secrets

You need to configure the following secrets in your GitHub repository (**Settings > Secrets and variables > Actions**):

| Secret Name | Description | Example |
| :--- | :--- | :--- |
| `AWS_ROLE_ARN` | The ARN of the IAM role for GitHub Actions to assume. | `arn:aws:iam::123456789012:role/github-actions-deployer` |
| `AWS_REGION` | The AWS region where resources will be deployed. | `eu-west-1` |
| `DOMAIN_NAME` | The domain name for the application. | `list.yourdomain.com` |
| `HOSTED_ZONE_ID` | The Route53 Hosted Zone ID for your domain. | `Z1234567890ABC` |

### AWS IAM Role Setup Guide

To allow GitHub Actions to deploy to your AWS account, follow these steps:

#### 1. Create OIDC Identity Provider
In the AWS IAM Console:
- Navigate to **Identity providers** > **Add provider**.
- **Provider type**: `OpenID Connect`.
- **Provider URL**: `https://token.actions.githubusercontent.com`.
- **Audience**: `sts.amazonaws.com`.

#### 2. Create the IAM Role
Create a new IAM role with a custom trust policy. Replace `<YOUR_ACCOUNT_ID>` and `<GITHUB_ORG>/<REPO>` with your values:

**Trust Relationship:**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::<YOUR_ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:<GITHUB_ORG>/p2p-shopping-list:*"
        }
      }
    }
  ]
}
```

#### 3. Permissions Policy
Attach a policy to the role with the following permissions. For production, it's recommended to restrict `Resource` to specific ARNs:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "s3:*",
                "cloudfront:*",
                "route53:GetHostedZone",
                "route53:ListResourceRecordSets",
                "route53:ChangeResourceRecordSets",
                "route53:GetChange",
                "acm:*",
                "iam:CreateServiceLinkedRole"
            ],
            "Resource": "*"
        }
    ]
}
```

## Infrastructure Setup (Terraform)

### ⚠️ CRITICAL: Remote Backend Requirement
By default, this repository uses **local state**. This will NOT work reliably with GitHub Actions because the state file is lost after each run, causing Terraform to attempt to recreate existing resources (leading to errors like `BucketAlreadyExists` or `OriginAccessControlAlreadyExists`).

**You MUST configure a remote backend** (like S3 and DynamoDB) in `terraform/main.tf` before running the GitHub Action deployment for the first time.

### Prerequisites
- [Terraform](https://developer.hashicorp.com/terraform/downloads) installed locally.
- AWS CLI configured with appropriate credentials.

### 1. Configuration
Create a `terraform.tfvars` file inside the `terraform/` directory to provide the required variables:

```hcl
# terraform/terraform.tfvars
aws_region     = "eu-west-1"
domain_name    = "list.yourdomain.com"
hosted_zone_id = "Z1234567890ABC"
```

### 2. Configure Remote Backend
Update `terraform/main.tf` to include a backend block:

```hcl
terraform {
  backend "s3" {
    bucket         = "your-terraform-state-bucket"
    key            = "p2p-shopping-list/terraform.tfstate"
    region         = "eu-west-1"
    dynamodb_table = "terraform-state-lock"
  }
  # ... rest of terraform block
}
```

### 3. Initialization
Initialize the Terraform workspace to download the necessary providers and configure the backend:

```bash
cd terraform
terraform init
```

### 4. Plan
Generate and review an execution plan:

```bash
terraform plan
```

### 5. Apply
Apply the changes to create the infrastructure:

```bash
terraform apply
```

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
