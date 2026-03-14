resource "aws_route53_record" "github_pages" {
  zone_id = var.hosted_zone_id
  name    = var.domain_name
  type    = "CNAME"
  ttl     = 300
  records = ["albertmorenodev.github.io"]
}
