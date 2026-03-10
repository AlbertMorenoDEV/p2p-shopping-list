variable "aws_region" {
  description = "The AWS region to deploy resources in"
  type        = string
  default     = "eu-west-1"
}

variable "domain_name" {
  description = "The domain name for the shopping list app"
  type        = string
  default     = "list.albertmoreno.dev"
}

variable "hosted_zone_id" {
  description = "The Route 53 Hosted Zone ID for the domain"
  type        = string
}
