from django.db import models
from decimal import Decimal
from django.contrib.auth.models import User
from django.utils import timezone

class SalesData(models.Model):
    division = models.CharField(max_length=255, blank=True, null=True)
    account_name = models.CharField(max_length=255, blank=True, null=True)
    customer_no = models.CharField(max_length=255, blank=True, null=True)
    account_id = models.CharField(max_length=255, blank=True, null=True)
    region = models.CharField(max_length=255, blank=True, null=True)
    sales_manager = models.CharField(max_length=255, blank=True, null=True)
    account_owner = models.CharField(max_length=255, blank=True, null=True)
    product_name = models.CharField(max_length=255)
    product_code = models.CharField(max_length=255)
    product_family = models.CharField(max_length=255, blank=True, null=True)
    protein_family = models.CharField(max_length=255, blank=True, null=True)
    year = models.CharField(max_length=10)  
    fiscal_quarter = models.CharField(max_length=255, blank=True, null=True)
    posting_month = models.CharField(max_length=255, blank=True, null=True)
    posting_date = models.DateField(blank=True, null=True)
    transaction_type = models.CharField(max_length=255)
    quantity_base = models.DecimalField(max_digits=10, decimal_places=2, blank=True, null=True)
    sales_amount = models.DecimalField(max_digits=12, decimal_places=2, blank=True, null=True)
    actual_freight = models.DecimalField(max_digits=12, decimal_places=2, blank=True, null=True)
    total_freight = models.DecimalField(max_digits=12, decimal_places=2, blank=True, null=True)
    freight_charge = models.DecimalField(max_digits=12, decimal_places=2, blank=True, null=True)
    freight_price_kg = models.DecimalField(max_digits=12, decimal_places=2, blank=True, null=True)
    item_charge_sum = models.DecimalField(max_digits=12, decimal_places=2, blank=True, null=True)
    net_sales_amount = models.DecimalField(max_digits=12, decimal_places=2, blank=True, null=True)
    cost_amount = models.DecimalField(max_digits=12, decimal_places=2, blank=True, null=True)
    net_margin = models.DecimalField(max_digits=12, decimal_places=2, blank=True, null=True)

    def __str__(self):
        return f"{self.product_name} ({self.account_name}) - {self.sales_amount}"

class ProgressBar(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, primary_key=True)
    total_rows = models.IntegerField(default=0)
    processed_rows = models.IntegerField(default=0)
    progress_percentage = models.FloatField(default=0)


    def __str__(self):
        return f"{self.user.username} - {self.progress_percentage}%"

    class Meta:
        verbose_name_plural = "Progress Bars"


class RevenueAnalytics(models.Model):
    year = models.IntegerField()
    quarter = models.CharField(max_length=2)  # 'Q1', 'Q2', etc.
    revenue_amount = models.DecimalField(max_digits=15, decimal_places=2, default=0)  # Default set here
    cost_amount = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True)  # Allow null for existing records
    net_margin = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True)  # Allow null for existing records
    is_forecast = models.BooleanField(default=False)  # To differentiate between historical and forecast data

    def __str__(self):
        return f"{self.year} {self.quarter} - {self.revenue_amount} ({'Forecast' if self.is_forecast else 'Actual'})"
    
    class Meta:
        unique_together = ('year', 'quarter')
        verbose_name = "Revenue Analytics"
        verbose_name_plural = "Revenue Analytics"

class VolumeForecasting(models.Model):
    product_name = models.CharField(max_length=100) 
    quarter = models.CharField(max_length=20)
    historical_quantity = models.FloatField()
    forecast_quantity = models.FloatField()
    is_forecast = models.BooleanField(default=False)
    region = models.CharField(max_length=100, null=True, blank=True) 
    account_owner = models.CharField(max_length=100, null=True, blank=True)  
    product_family = models.CharField(max_length=100, null=True, blank=True)  

    class Meta:
        unique_together = ('product_name', 'quarter', 'region', 'account_owner', 'product_family')

    def __str__(self):
        return f"{self.product_name} - {self.quarter} - {self.region} - {self.account_owner} - {self.product_family}"
