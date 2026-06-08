variable "aws_region"              { default = "ap-south-1" }
variable "app_name"                { default = "freshbus-dashboard" }
variable "api_image"               { description = "ECR image URI for the API container" }
variable "db_password"             { description = "RDS master password"; sensitive = true }
variable "database_url_placeholder"{ default = "REPLACE_AFTER_DEPLOY" }
variable "admin_token_placeholder" { default = "REPLACE_WITH_SECURE_TOKEN" }
variable "nlp_model_name"          { default = "cardiffnlp/twitter-xlm-roberta-base-sentiment" }
