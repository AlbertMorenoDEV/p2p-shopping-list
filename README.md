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
                "acm:*",
                "iam:CreateServiceLinkedRole"
            ],
            "Resource": "*"
        }
    ]
}
```

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
