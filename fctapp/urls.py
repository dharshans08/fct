from django.urls import path
from . import views

urlpatterns = [
    path('', views.login, name='login' ),
    path('add_sales/', views.add_sales, name='add_sales'),
    path('sales_forcast/', views.sales_forcast, name='sales_forcast'),
    path('logout/', views.logout, name='logout'),
    path('sales_history/', views.sales_history, name='sales_history'),
    path('get_progress/', views.get_progress, name='get_progress'),
    path('get_divisions/', views.get_divisions, name='get_divisions'),
    path('get_account_owners/', views.get_account_owners, name='get_account_owners'),
    path('get_regions/', views.get_regions, name='get_regions'),
    path('get_product_families/', views.get_product_families, name='get_product_families'),
    path('compare_division/', views.compare_division, name='compare_division'),
    path('compare_account_owner/', views.compare_account_owners, name='compare_account_owners'),
    path('compare_region/', views.compare_region, name='compare_region'),
    path('compare_product_family/', views.compare_product_family, name='compare_product_family'),
    path('get_session_dates/', views.get_session_dates, name='get_session_dates'),
    path('save_session_dates/', views.save_session_dates, name='save_session_dates'),
    path('get_forecast_session/', views.get_forecast_session, name='get_forecast_session'),
    path('save_forecast_session/', views.save_forecast_session, name='save_forecast_session'),
    path('revenue_analytics/', views.revenue_analytics, name='revenue_analytics'),
    path('sales_forecasting/', views.sales_forecasting_view, name='sales_forecasting'),
    path('forecasting/', views.forecasting, name='forecasting'),
    path('get_product_data/',views.get_product_data, name='get_product_data'),
    
]