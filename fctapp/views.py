from django.shortcuts import render, redirect
from django.http import JsonResponse, HttpResponse
from django.contrib import messages
from django.views.decorators.csrf import ensure_csrf_cookie, csrf_protect
from django.contrib.auth import authenticate, login as auth_login, logout as django_logout
from django.contrib.auth.models import User
from django.contrib.auth.decorators import login_required
from django.db.models.functions import ExtractYear
from django.db.models import F, Sum, Value as V, FloatField, Min, Max, Count, Q
from django.db.models.functions import Coalesce
from django.db.utils import IntegrityError
from django.db import connection
from django.utils.timezone import now
from datetime import datetime, timedelta
from decimal import Decimal
from io import StringIO
import pandas as pd
import logging
import numpy as np
import csv
import time
import threading
from threading import Lock
from random import randint
from django.views.decorators.http import require_http_methods
import json
from statsmodels.tsa.statespace.sarimax import SARIMAX
from statsmodels.tsa.stattools import adfuller
from scipy import stats
import warnings
from django.db import transaction
import re
from statsmodels.tsa.arima.model import ARIMA


# Suppress warnings
warnings.filterwarnings("ignore")

# Import your models
from .models import SalesData, ProgressBar, RevenueAnalytics,VolumeForecasting

MAX_CHUNK_SIZE = 1
CHUNK_SIZE = 10000

# Global progress tracking
progress_lock = Lock()
upload_progress = {
    'total_rows': 0,
    'processed_rows': 0,
    'progress_percentage': 0
}

current_userid = None
piechart_datafeed = []  # Reset the list at the start of each request

def update_progress(count, total):
    global upload_progress, current_userid
    try:
        upload_progress['total_rows'] = total
        upload_progress['processed_rows'] = count
        upload_progress['progress_percentage'] = min(
            round((count / total) * 100, 2) if total > 0 else 0, 
            100
        )

        # If a user ID is set, save progress to database
        if current_userid is not None:
            try:
                with connection.cursor() as cursor:
                    query = """
                        INSERT INTO fctapp_progressbar 
                        (user_id, total_rows, processed_rows, progress_percentage)
                        VALUES (%s, %s, %s, %s)
                        ON DUPLICATE KEY UPDATE 
                        total_rows = %s, 
                        processed_rows = %s, 
                        progress_percentage = %s
                    """
                    cursor.execute(query, [
                        current_userid, 
                        total, 
                        count, 
                        upload_progress['progress_percentage'],
                        total,
                        count,
                        upload_progress['progress_percentage']
                    ])
            except Exception as e:
                print(f"Error saving progress to database: {e}")

    except Exception as e:
        print(f"Error in update_progress: {e}")



@login_required
def get_progress(request):
    """
    Retrieve user-specific progress details from the database
    """
    try:
        with connection.cursor() as cursor:
            # Attempt to fetch progress for the current user
            cursor.execute("""
                SELECT total_rows, processed_rows, progress_percentage 
                FROM fctapp_progressbar 
                WHERE user_id = %s
            """, [request.user.id])
            
            result = cursor.fetchone()
            
            if result:
                # If user-specific progress exists
                total_rows, processed_rows, progress_percentage = result
                return JsonResponse({
                    'progress': progress_percentage,
                    'processed_rows': processed_rows,
                    'total_rows': total_rows
                })
            else:
                # Fallback to global progress if no user-specific progress
                return JsonResponse({
                    'progress': upload_progress['progress_percentage'],
                    'processed_rows': upload_progress['processed_rows'],
                    'total_rows': upload_progress['total_rows']
                })
    except Exception as e:
        # Handle any database or other errors
        print(f"Error retrieving progress: {e}")
        return JsonResponse({
            'error': str(e),
            'progress': 0,
            'processed_rows': 0,
            'total_rows': 0
        }, status=500)

        

@csrf_protect
def login(request):
    alert = None  
    email = None  
    password = None  

    if request.method == 'POST':
        email = request.POST.get('email')
        password = request.POST.get('password')
        
        try:
            # Get the username corresponding to the entered email
            username = User.objects.get(email=email).username
        except User.DoesNotExist:
            username = None

        user = authenticate(request, username=username, password=password)
        if user is not None:
            auth_login(request, user)
            
            # Check if there is any data in the SalesData model
            if SalesData.objects.exists():  
                 return redirect('sales_forcast') 
            else:  # If no data exists
                return redirect('add_sales')  
        else:
            messages.error(request, 'Invalid email or password')
            print("Invalid email or password")  
            alert = 'Invalid credentials' 
            messages.error(request, alert)  
            
    # Pass alert, email, and password to template
    return render(request, 'login.html', {
        'alert': alert if alert else None, 
        'email': email, 
        'password': password or '' 
    })

def clean_decimal(value):
    if value is None or value.strip() == '' or value.strip() == '-' or value.strip() == '  -   ':
        return None  # or 0 if you prefer
    try:
        return Decimal(value.strip().replace(',', ''))  # Remove commas for proper conversion
    except Exception as e:
        return None  # or 0


def parse_date(date_str):
    """Convert date string to datetime object"""
    if not date_str or date_str.strip() == '-':
        return None
    try:
        return datetime.strptime(date_str.strip(), '%m/%d/%Y').date()
    except:
        return None


def add_sales(request):
    global current_userid
    current_userid = request.user.id if request.user.is_authenticated else None
    global upload_progress
    upload_progress = {'total_rows': 0, 'processed_rows': 0, 'progress_percentage': 0}

    if request.method == 'POST':
        try:
            csv_file = request.FILES.get('csv_file')
            if not csv_file:
                return JsonResponse({'error': 'No file was uploaded.'}, status=400)

            overall_start_time = time.time()
            print("Started processing CSV file...")

            content = csv_file.read().decode('utf-8')
            csv_data = StringIO(content)
            reader = csv.DictReader(csv_data)

            required_columns = {
                'Division', 'Region', 'Account Owner: Full Name', 'Product: Product Name',
                'Posting Date', 'Type', 'Sales Amount', 'Cost Amount',
                'Net Margin', 'Product Family', 'Quantity (Base)'
            }

            column_mapping = {}
            cleaned_columns = []
            for col in reader.fieldnames:
                cleaned_col = re.sub(r'\s+', ' ', col.strip())
                column_mapping[cleaned_col] = col
                cleaned_columns.append(cleaned_col)

            # Validate column headers
            missing_columns = required_columns - set(cleaned_columns)
            if missing_columns:
                error_message = f'Missing required columns: {", ".join(missing_columns)}'
                print(f"Validation Error: {error_message}")
                return JsonResponse({
                    'error': error_message,
                    'status': 'error',
                    'missing_columns': list(missing_columns)
                }, status=400)

            # Check if CSV is empty
            if not any(reader):
                return JsonResponse({'message': 'CSV file is empty.', 'clear_cache': True}, status=200)

            # Reinitialize reader
            csv_data.seek(0)
            reader = csv.DictReader(csv_data)
            reader.fieldnames = cleaned_columns

            # Delete existing data
            try:
                with connection.cursor() as cursor:
                    cursor.execute("DELETE FROM fctapp_salesdata")
                    cursor.execute("DELETE FROM fctapp_progressbar")
                    cursor.execute("DELETE FROM fctapp_revenueanalytics")
                    cursor.execute("DELETE FROM fctapp_volumeforecasting")
                print("Existing data deleted successfully.")
            except Exception as e:
                print(f"Error deleting data: {e}")
                reset_user_progress(current_userid)
                return JsonResponse({'error': 'Failed to delete existing data.'}, status=500)

            # Prepare query
            query = """
                INSERT INTO fctapp_salesdata (
                    division, account_name, customer_no, account_id, region,
                    sales_manager, account_owner, product_name,
                    product_code, product_family, protein_family, year, fiscal_quarter,
                    posting_month, posting_date, transaction_type, quantity_base,
                    sales_amount, actual_freight, total_freight, freight_charge,
                    freight_price_kg, item_charge_sum, net_sales_amount,
                    cost_amount, net_margin
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                          %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """

            # Process CSV data and insert in chunks
            sales_data_values = []
            total_rows = sum(1 for _ in reader)
            csv_data.seek(0)
            reader = csv.DictReader(csv_data)
            reader.fieldnames = cleaned_columns
            next(reader)  # Skip header row

            total_count = 0
            success_count = 0
            errors = []

            for row_num, row in enumerate(reader, 1):
                total_count += 1

                product_name = row.get('Product: Product Name', '').strip()
                if not product_name:
                    errors.append({'row_num': row_num, 'error': 'Product Name is empty', 'data': row})
                    continue

                try:
                    sales_data_values.append((
                        row.get('Division', '').strip() or '0',
                        row.get('Account Name', '').strip() or '0',
                        row.get('Customer No.', '').strip() or '0',
                        row.get('Account18digitid', '').strip() or '0',
                        row.get('Region', '').strip() or '0',
                        row.get('Sales Manager Concerned', '').strip() or '0',
                        row.get('Account Owner: Full Name', '').strip() or '0',
                        product_name,  
                        row.get('Product Code', '').strip() or '0',
                        row.get('Product Family', '').strip() or '0',
                        row.get('Protein Family', '').strip() or '0',
                        row.get('Year', '').strip() or '0',
                        row.get('Fiscal Quarter', '').strip() or '0',
                        row.get('Posting Month', '').strip() or '0',
                        parse_date(row.get('Posting Date')) or None,
                        row.get('Type', '').strip() or '0',
                        clean_decimal(row.get('Quantity (Base)')) or 0,
                        clean_decimal(row.get('Sales Amount')) or 0,
                        clean_decimal(row.get('Actual Freight')) or 0,
                        clean_decimal(row.get('Total Freight')) or 0,
                        clean_decimal(row.get('Freight Charge')) or 0,
                        clean_decimal(row.get('Freight Price per Kg')) or 0,
                        clean_decimal(row.get('Item Charge (Sum)')) or 0,
                        clean_decimal(row.get('Net Sales Amount')) or 0,
                        clean_decimal(row.get('Cost Amount')) or 0,
                        clean_decimal(row.get('Net Margin')) or 0
                    ))

                    if len(sales_data_values) >= CHUNK_SIZE:
                        with connection.cursor() as cursor:
                            cursor.executemany(query, sales_data_values)
                        success_count += len(sales_data_values)
                        update_progress(success_count, total_rows)
                        sales_data_values = []

                except Exception as e:
                    errors.append({'row_num': row_num, 'error': str(e), 'data': row})

            # Insert remaining rows
            if sales_data_values:
                with connection.cursor() as cursor:
                    cursor.executemany(query, sales_data_values)
                success_count += len(sales_data_values)

            overall_end_time = time.time()
            time_taken = round(overall_end_time - overall_start_time, 2)
            print(f"CSV processing completed in {time_taken} seconds.")

            request.session.pop('from_date', None)
            request.session.pop('to_date', None)
            request.session.pop('forecast_from_date', None)
            request.session.pop('forecast_to_date', None)

            if current_userid is not None:
                reset_user_progress(current_userid)

            request.session['total_sales'] = success_count
            request.session['previous_sales'] = str(success_count)

            return JsonResponse({
                'message': f'Successfully processed {success_count} rows',
                'added_records_count': success_count,
                'time_taken': f'{time_taken} seconds',
                'errors': errors,
                'clear_cache': True
            })

        except Exception as e:
            reset_user_progress(current_userid)
            return JsonResponse({'error': str(e)}, status=500)

    return render(request, 'addsales.html')


@login_required
def sales_forcast(request):
    # Get forecast-specific dates from session if they exist
    start_date = request.session.get('forecast_from_date')
    end_date = request.session.get('forecast_to_date')
    context = {
        'start_date': start_date,
        'end_date': end_date,
    }   
    return render(request, 'salesforcasting.html', context)

def get_fiscal_quarter(month, fiscal_year_start_month):
                if month >= fiscal_year_start_month and month < fiscal_year_start_month + 3:
                    return 'Q1'
                elif month >= fiscal_year_start_month + 3 and month < fiscal_year_start_month + 6:
                    return 'Q2'
                elif month >= fiscal_year_start_month + 6 and month < fiscal_year_start_month + 9:
                    return 'Q3'
                else:
                    # For months before the fiscal year start (Q4 of previous year)
                    return 'Q4' 


def get_product_color(index):
            # Predefined colors for top 4 products
            colors = [
                'rgb(255, 59, 48)',  # Red
                'rgb(52, 199, 89)',  # Green
                'rgb(0, 122, 255)',  # Blue
                'rgb(255, 204, 0)',  # Yellow
            ]
            return colors[index] if index < len(colors) else 'rgb(169, 169, 169)'

@login_required
def sales_history(request):
    global piechart_datafeed
    piechart_datafeed = []  # Reset the global list at the start of each request

    # Initialize context variables
    context = {}
    chart_data = {
        'labels': [],
        'actual_sales': [],
        'budget_sales': []
    }
    total_sales = Decimal('0')
    budget_totalsales = Decimal('0')
    net_margin_percentage = Decimal('0')
    sales_percentage_increase = Decimal('0')
    table_datafeed = []

    try:
        # Get the earliest and latest posting dates in the database
        date_range = SalesData.objects.aggregate(
            earliest_date=Min('posting_date'),
            latest_date=Max('posting_date')
        )
        earliest_date = date_range['earliest_date']
        latest_date = date_range['latest_date']

        # Handle case where no data exists in the database
        if not earliest_date or not latest_date:
            error_message = 'No data available in the database'
            if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
                return JsonResponse({
                    'error': error_message,
                    'chart_data': chart_data,
                    'total_sales': float(total_sales),
                    'net_margin_percentage': float(net_margin_percentage),
                    'sales_percentage_increase': float(sales_percentage_increase),
                    'recent_sales_data': table_datafeed,
                    'pieChartDataFeed': piechart_datafeed
                })
            context['error'] = error_message
            return render(request, 'saleshistory.html', context)

        # Retrieve start_date and end_date from request or session
        start_date = request.GET.get('start_date') or request.session.get('from_date')
        end_date = request.GET.get('end_date') or request.session.get('to_date')

        # Save dates to session if present in the request
        if request.GET.get('start_date'):
            request.session['from_date'] = request.GET.get('start_date')
        if request.GET.get('end_date'):
            request.session['to_date'] = request.GET.get('end_date')

        # Validate and parse the date inputs
        try:
            if start_date and end_date:
                start_date = datetime.strptime(start_date, '%Y-%m-%d').date()
                end_date = datetime.strptime(end_date, '%Y-%m-%d').date()
                if start_date > end_date:
                    return render(request, 'saleshistory.html', {'error': 'Start date must be earlier than end date.'})
        except (ValueError, TypeError):
            return render(request, 'saleshistory.html', {'error': 'Invalid date format. Use YYYY-MM-DD.'})

        # Validate date range based on database year range
        if start_date and end_date:
            start_year = start_date.year
            end_year = end_date.year
            earliest_year = earliest_date.year
            latest_year = latest_date.year

            if (start_year < earliest_year) or (end_year > latest_year):
                error_message = f"Selected year range is outside the available data range. Data is available for the years {earliest_year} to {latest_year}."
                if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
                    return JsonResponse({'error': error_message})
                return render(request, 'saleshistory.html', {'error': error_message})

        # Filter and aggregate sales data based on date range
        sales_data = SalesData.objects.all()
        if start_date and end_date:
            sales_data = sales_data.filter(posting_date__range=(start_date, end_date))

        # Perform the aggregation
        results = sales_data.filter(transaction_type='Actual').aggregate(
        total_sales=Sum('sales_amount'),
        total_net_margin=Sum('net_margin')
)
        result2 = sales_data.filter(transaction_type='Budget').aggregate(
        budget_totalsales=Sum('sales_amount'),
        
)

        total_sales = results['total_sales'] or Decimal('0')
        total_net_margin = results['total_net_margin'] or Decimal('0')
        budget_totalsales = result2['budget_totalsales'] or Decimal('0')

        

        # Calculate net margin percentage
        if total_sales > 0:
            net_margin_percentage = ((total_net_margin / total_sales) * Decimal('100')).quantize(Decimal('0.01'))

        # Calculate sales percentage increase
        if start_date and end_date:
           
            # Calculate percentage increase
            if total_sales > 0:
                sales_percentage_increase = ((total_sales - budget_totalsales) / total_sales) * Decimal('100')
            else:
                sales_percentage_increase = Decimal('0')
        else:
            sales_percentage_increase = Decimal('0')



        # Prepare chart data for sales visualization
        data = list(sales_data.values('posting_date', 'transaction_type', 'sales_amount'))
        df = pd.DataFrame(data)

        if not df.empty:
            # Convert posting_date to datetime and handle errors
            df['posting_date'] = pd.to_datetime(df['posting_date'], errors='coerce')

            # Drop rows with invalid dates (if any)
            df = df.dropna(subset=['posting_date'])

            # Extract Year and Month
            df['Year'] = df['posting_date'].dt.year
            df['Month'] = df['posting_date'].dt.month

            # Calculate Fiscal Year
            fiscal_year_start_month = 4  # Fiscal year starts in April
            df['Fiscal_Year'] = df['Year'] - (df['Month'] < fiscal_year_start_month).astype(int)

            # Calculate Fiscal Quarter
       

            df['Fiscal_Quarter'] = df['Month'].apply(lambda month: get_fiscal_quarter(month, fiscal_year_start_month))

            # Combine Fiscal Year and Quarter
            df['Year_Quarter'] = df['Fiscal_Year'].astype(str) + ' ' + df['Fiscal_Quarter']

            # Ensure sales_amount is numeric
            df['sales_amount'] = df['sales_amount'].astype(float)

            # Group data by Year_Quarter and transaction_type
            grouped_data = df.groupby(['Year_Quarter', 'transaction_type'])['sales_amount'].sum().reset_index()

            # Extract unique Year_Quarter values and sort them by fiscal year and quarter
            year_quarters = sorted(
                grouped_data['Year_Quarter'].unique(),
                key=lambda x: (
                    int(x.split()[0]),  # Fiscal Year
                    'Q4' if x.split()[1] == 'Q4' else x.split()[1]  # Special handling for Q4-PY
                )
            )

            # Extract sales amounts for Actual and Budget transaction types
            actual_sales = [
                float(grouped_data[(grouped_data['Year_Quarter'] == year_quarter) & (grouped_data['transaction_type'] == 'Actual')]['sales_amount'].sum())
                for year_quarter in year_quarters
            ]
            budget_sales = [
                float(grouped_data[(grouped_data['Year_Quarter'] == year_quarter) & (grouped_data['transaction_type'] == 'Budget')]['sales_amount'].sum())
                for year_quarter in year_quarters
            ]

            # Prepare the chart data
            chart_data = {
                'labels': year_quarters,        # Year + Quarter labels
                'actual_sales': actual_sales,  # Actual sales for each Year + Quarter
                'budget_sales': budget_sales,  # Budget sales for each Year + Quarter
            }

            
       # Update the recent sales data query to fetch the last 5 rows from the end date
        if start_date and end_date:
            recent_sales_data = SalesData.objects.filter( transaction_type='Actual',
                posting_date__range=[start_date, end_date]
            ).values(
                'product_name',
                'product_family',
                'region',
                'sales_amount',
                'posting_date'
            ).order_by('-posting_date')[:5]
        else:
            recent_sales_data = SalesData.objects.values(
                'product_name',
                'product_family',
                'region',
                'sales_amount',
                'posting_date'
            ).order_by('-posting_date')[:5]
        
        # Initialize result data for the frontend
        table_datafeed = []

        for sale in recent_sales_data:  
            table_datafeed.append({
                "region": sale['region'],
                "product_name": sale['product_name'],
                "product_family": sale['product_family'],
                "sales_amount": float(sale['sales_amount']),
                "posting_date": sale['posting_date'].strftime('%Y-%m-%d'),
            })

        context.update({
            'chart_data': chart_data,
            'total_sales': float(total_sales),
            'net_margin_percentage': float(net_margin_percentage),
            'sales_percentage_increase': float(sales_percentage_increase),
            'start_date': start_date,
            'end_date': end_date,
            'earliest_date': earliest_date,
            'latest_date': latest_date,
            'recent_sales_data': table_datafeed,
            'pieChartDataFeed': piechart_datafeed
        })

        # Get top 4 products and calculate total orders
        product_counts = (
            sales_data
            .values('product_name')
            .annotate(
                orders=Sum('quantity_base',filter=Q(transaction_type='Actual')),
                total_amount=Sum('sales_amount',filter=Q(transaction_type='Actual'))
            )
            .order_by('-total_amount')[:4]  # Limit to top 4 products
        )   

        # Calculate total orders for percentage calculation
        total_orders = sum(product['orders'] for product in product_counts)

   

        # Append products to the global list
        for index, product in enumerate(product_counts):
            piechart_datafeed.append({
                'name': product['product_name'],
                'orders': product['orders'],
                'amount': product['total_amount'],
                'color': get_product_color(index),
                'percentage': round((product['orders'] / total_orders * 100), 2) if total_orders > 0 else 0
            })


        # Get division summary data
        division_summary = SalesData.objects.filter(
            posting_date__range=[start_date, end_date]
        ).annotate(
            posting_year=ExtractYear('posting_date')
        ).values(
            'division',
            'posting_year'
        ).annotate(
            count=Count('id'),
            total_amount=Sum('sales_amount')
        ).order_by(
            'posting_year',
            '-count'
        )

        # Create a structured array of division data
        division_data = []
        for entry in division_summary:
            division_data.append({
                'division': entry['division'],
                'year': entry['posting_year'],
                'count': entry['count'],
                'total_amount': float(entry['total_amount'])
            })
        
        

        # Add both the queryset and the array to context
        context.update({
            'division_summary': division_summary,
            'division_data': division_data,
        })

        
        # Add AJAX response handling at the end
        if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
            return JsonResponse({
                'chart_data': chart_data if 'chart_data' in locals() else None,
                'total_sales': float(total_sales),
                'net_margin_percentage': float(net_margin_percentage),
                'sales_percentage_increase': float(sales_percentage_increase),
                'recent_sales_data': table_datafeed,
                'pieChartDataFeed': piechart_datafeed
            })

        return render(request, 'saleshistory.html', context)

    except Exception as e:
        print(f"Error in salesHistory view: {str(e)}")
        if request.headers.get('X-Requested-With') == 'XMLHttpRequest':
            return JsonResponse({
                'error': 'An error occurred while processing your request',
                'chart_data': chart_data,
                'total_sales': float(total_sales),
                'net_margin_percentage': float(net_margin_percentage),
                'sales_percentage_increase': float(sales_percentage_increase),
                'recent_sales_data': table_datafeed,
                'pieChartDataFeed': piechart_datafeed
            })
        context['error'] = 'An error occurred while processing your request'
        return render(request, 'saleshistory.html', context)

def logout(request):
    # Clear specific session data
    request.session.pop('from_date', None)
    request.session.pop('to_date', None)
    request.session.pop('forecast_from_date', None)
    request.session.pop('forecast_to_date', None)
    print()
    # Rest of your existing logout code...
    request.session.flush() 
    django_logout(request)
    return redirect('login')


def reset_user_progress(user_id):
    """Reset progress percentage in the database for the specified user."""
    if user_id is not None:
        try:
            with connection.cursor() as cursor:
                cursor.execute("""
                    UPDATE fctapp_progressbar 
                    SET progress_percentage = 0,
                        total_rows = 0,
                        processed_rows = 0 
                    WHERE user_id = %s
                """, [user_id])
        except Exception as e:
            print(f"Error resetting progress in database: {e}")


@login_required
def get_account_owners(request):
    try:
        # Get start_date and end_date from request parameters
        start_date = request.GET.get('start_date')
        end_date = request.GET.get('end_date')

        # Convert dates if provided
        if start_date and end_date:
            start_date = datetime.strptime(start_date, '%Y-%m-%d').date()
            end_date = datetime.strptime(end_date, '%Y-%m-%d').date()

        # Base query for account owners
        account_owners = SalesData.objects.exclude(account_owner__isnull=True)\
                                          .exclude(account_owner__exact='')\
                                          .values_list('account_owner', flat=True)\
                                          .distinct()\
                                          .order_by('account_owner')

        # Query for summary
        account_owner_query = SalesData.objects.exclude(account_owner__isnull=True)\
                                               .exclude(account_owner__exact='')
        if start_date and end_date:
            account_owner_query = account_owner_query.filter(posting_date__range=[start_date, end_date])

        account_owner_summary = account_owner_query.annotate(
            posting_year=ExtractYear('posting_date')
        ).values(
            'account_owner',
            'posting_year'
        ).annotate(
            count=Count('id'),
            total_amount=Sum('sales_amount')
        ).order_by('posting_year', '-count')

        # Process summary
        account_owner_data = [{
            'account_owner': entry['account_owner'],
            'year': entry['posting_year'],
            'count': entry['count'],
            'total_amount': float(entry['total_amount']) if entry['total_amount'] else 0.0
        } for entry in account_owner_summary]

        response = {
            'status': 'success',
            'account_owners': list(account_owners),
            'account_owner_summary': account_owner_data
        }

        return JsonResponse(response)

    except Exception as e:
        response = {
            'status': 'error',
            'message': str(e)
        }
        return JsonResponse(response, status=500)


@login_required
def get_divisions(request):
    try:
        # Get start_date and end_date from request parameters
        start_date = request.GET.get('start_date')
        end_date = request.GET.get('end_date')

        # Convert dates if provided, otherwise use None
        if start_date and end_date:
            start_date = datetime.strptime(start_date, '%Y-%m-%d').date()
            end_date = datetime.strptime(end_date, '%Y-%m-%d').date()
        
        # Base query for divisions
        divisions = SalesData.objects.exclude(division__isnull=True)\
                                   .exclude(division__exact='')\
                                   .values_list('division', flat=True)\
                                   .distinct()\
                                   .order_by('division')

        # Get division summary data
        division_query = SalesData.objects
        if start_date and end_date:
            division_query = division_query.filter(posting_date__range=[start_date, end_date])

        division_summary = division_query.annotate(
            posting_year=ExtractYear('posting_date')
        ).values(
            'division',
            'posting_year'
        ).annotate(
            count=Count('id'),
            total_amount=Sum('sales_amount')
        ).order_by(
            'posting_year',
            '-count'
        )

        # Create structured division data
        division_data = [{
            'division': entry['division'],
            'year': entry['posting_year'],
            'count': entry['count'],
            'total_amount': float(entry['total_amount'])
        } for entry in division_summary]
        
        if division_data:
            print("Sample division entry:", division_data[0])
        else:
            print("No division data found")

        return JsonResponse({
            'status': 'success',
            'divisions': list(divisions),
            'division_summary': division_data
        })
    except Exception as e:
        return JsonResponse({
            'status': 'error',
            'message': str(e)
        }, status=500)

@login_required
def get_regions(request):
    try:
        # Get start_date and end_date from request parameters
        start_date = request.GET.get('start_date')
        end_date = request.GET.get('end_date')

        # Convert dates if provided
        if start_date and end_date:
            start_date = datetime.strptime(start_date, '%Y-%m-%d').date()
            end_date = datetime.strptime(end_date, '%Y-%m-%d').date()
        
        # Base query for regions
        regions = SalesData.objects.exclude(region__isnull=True)\
                                 .exclude(region__exact='')\
                                 .values_list('region', flat=True)\
                                 .distinct()\
                                 .order_by('region')

        # Get region summary data
        region_query = SalesData.objects
        if start_date and end_date:
            region_query = region_query.filter(posting_date__range=[start_date, end_date])

        region_summary = region_query.annotate(
            posting_year=ExtractYear('posting_date')
        ).values(
            'region',
            'posting_year'
        ).annotate(
            count=Count('id'),
            total_amount=Sum('sales_amount')
        ).order_by(
            'posting_year',
            '-count'
        )

        # Create structured region data
        region_data = [{
            'region': entry['region'],
            'year': entry['posting_year'],
            'count': entry['count'],
            'total_amount': float(entry['total_amount'])
        } for entry in region_summary]

        return JsonResponse({
            'status': 'success',
            'regions': list(regions),
            'region_summary': region_data
        })
    except Exception as e:
        print(f"Error in get_regions: {e}")  
        return JsonResponse({
            'status': 'error',
            'message': str(e)
        }, status=500)

@login_required
def get_product_families(request):
    try:
        # Get start_date and end_date from request parameters
        start_date = request.GET.get('start_date')
        end_date = request.GET.get('end_date')

        # Convert dates if provided
        if start_date and end_date:
            start_date = datetime.strptime(start_date, '%Y-%m-%d').date()
            end_date = datetime.strptime(end_date, '%Y-%m-%d').date()
        
        # Base query for product families
        product_families = SalesData.objects.exclude(product_family__isnull=True)\
                                          .exclude(product_family__exact='')\
                                          .values_list('product_family', flat=True)\
                                          .distinct()\
                                          .order_by('product_family')

        # Get product family summary data
        family_query = SalesData.objects
        if start_date and end_date:
            family_query = family_query.filter(posting_date__range=[start_date, end_date])

        family_summary = family_query.annotate(
            posting_year=ExtractYear('posting_date')
        ).values(
            'product_family',
            'posting_year'
        ).annotate(
            count=Count('id'),
            total_amount=Sum('sales_amount')
        ).order_by(
            'posting_year',
            '-count'
        )

        # Create structured product family data
        family_data = [{
            'product_family': entry['product_family'],
            'year': entry['posting_year'],
            'count': entry['count'],
            'total_amount': float(entry['total_amount'])
        } for entry in family_summary]

        print("Product Family Data Structure:", family_data)
        print(f"Number of product family entries: {len(family_data)}")
        if family_data:
            print("Sample product family entry:", family_data[0])
        else:
            print("No product family data found")

        return JsonResponse({
            'status': 'success',
            'product_families': list(product_families),
            'family_summary': family_data
        })
    except Exception as e:
        print(f"Error in get_product_families: {e}") 
        return JsonResponse({
            'status': 'error',
            'message': str(e)
        }, status=500)

@login_required
def compare_division(request):
    try:
        # Get parameters from request
        start_date = request.GET.get('start_date')
        end_date = request.GET.get('end_date')
        items = request.GET.get('items', '').split(',')

        if len(items) != 2: 
            return JsonResponse({
                'status': 'error',
                'message': 'Exactly two items must be selected for comparison'
            }, status=400)

        # Convert dates
        start_date = datetime.strptime(start_date, '%Y-%m-%d').date()
        end_date = datetime.strptime(end_date, '%Y-%m-%d').date()

        # Query data for the selected divisions using posting_year instead of year
        data = SalesData.objects.filter(
            posting_date__range=[start_date, end_date],
            division__in=items,
            transaction_type='Actual'
        ).annotate(
            posting_year=ExtractYear('posting_date')
        ).values(
            'division',
            'posting_year'
        ).annotate(
            total_sales=Sum('sales_amount', )
        ).order_by('posting_year', 'division')

        # Process data for chart
        years = sorted(list(set(entry['posting_year'] for entry in data)))
        values = {division: [] for division in items}

        # Initialize with zeros
        for division in items:
            values[division] = [0] * len(years)

        # Fill in actual values
        for entry in data:
            year_index = years.index(entry['posting_year'])
            values[entry['division']][year_index] = float(entry['total_sales'])

        return JsonResponse({
            'status': 'success',
            'years': years,
            'values': values
        })

    except Exception as e:
        print(f"Error in compare_division: {e}")
        return JsonResponse({
            'status': 'error',
            'message': str(e)
        }, status=500)

@login_required
def compare_region(request):
    try:
        # Get parameters from request
        start_date = request.GET.get('start_date')
        end_date = request.GET.get('end_date')
        items = request.GET.get('items', '').split(',')

        if len(items) != 2:
            return JsonResponse({
                'status': 'error',
                'message': 'Exactly two items must be selected for comparison'
            }, status=400)

        # Convert dates
        start_date = datetime.strptime(start_date, '%Y-%m-%d').date()
        end_date = datetime.strptime(end_date, '%Y-%m-%d').date()

        # Query data for the selected regions
        data = SalesData.objects.filter(
            posting_date__range=[start_date, end_date],
            region__in=items,
            transaction_type='Actual'
        ).annotate(
            posting_year=ExtractYear('posting_date')
        ).values(
            'region',
            'posting_year'
        ).annotate(
            total_sales=Sum('sales_amount',)
        ).order_by('posting_year', 'region')

        # Process data for chart
        years = sorted(list(set(entry['posting_year'] for entry in data)))
        values = {region: [] for region in items}

        # Initialize with zeros
        for region in items:
            values[region] = [0] * len(years)

        # Fill in actual values
        for entry in data:
            year_index = years.index(entry['posting_year'])
            values[entry['region']][year_index] = float(entry['total_sales'])

        return JsonResponse({
            'status': 'success',
            'years': years,
            'values': values
        })

    except Exception as e:
        print(f"Error in compare_region: {e}")
        return JsonResponse({
            'status': 'error',
            'message': str(e)
        }, status=500)

@login_required
def compare_product_family(request):
    try:
        # Get parameters from request
        start_date = request.GET.get('start_date')
        end_date = request.GET.get('end_date')
        items = request.GET.get('items', '').split(',')

        if len(items) != 2:
            return JsonResponse({
                'status': 'error',
                'message': 'Exactly two items must be selected for comparison'
            }, status=400)

        # Convert dates
        start_date = datetime.strptime(start_date, '%Y-%m-%d').date()
        end_date = datetime.strptime(end_date, '%Y-%m-%d').date()

        # Query data for the selected product families
        data = SalesData.objects.filter(
            posting_date__range=[start_date, end_date],
            product_family__in=items,
            transaction_type='Actual'
        ).annotate(
            posting_year=ExtractYear('posting_date')
        ).values(
            'product_family',
            'posting_year'
        ).annotate(
            total_sales=Sum('sales_amount', )
        ).order_by('posting_year', 'product_family')

        # Process data for chart
        years = sorted(list(set(entry['posting_year'] for entry in data)))
        values = {family: [] for family in items}
        # Initialize with zeros
        for family in items:
            values[family] = [0] * len(years)

        # Fill in actual values
        for entry in data:
            year_index = years.index(entry['posting_year'])
            values[entry['product_family']][year_index] = float(entry['total_sales'])

        return JsonResponse({
            'status': 'success',
            'years': years,
            'values': values
        })

    except Exception as e:
        print(f"Error in compare_product_family: {e}")
        return JsonResponse({
            'status': 'error',
            'message': str(e)
        }, status=500)
    
import json  # Import the json module for pretty-printing

@login_required
def compare_account_owners(request):
    try:
        # Get parameters from request
        start_date = request.GET.get('start_date')
        end_date = request.GET.get('end_date')
        items = request.GET.get('items', '').split(',')

        # Ensure exactly two account owners are selected for comparison
        if len(items) != 2:
            response = {
                'status': 'error',
                'message': 'Exactly two items must be selected for comparison'
            }
            print("JSON Response:")
            print(json.dumps(response, indent=4))  # Pretty-print error response
            return JsonResponse(response, status=400)

        # Convert dates
        start_date = datetime.strptime(start_date, '%Y-%m-%d').date()
        end_date = datetime.strptime(end_date, '%Y-%m-%d').date()

        # Query data for the selected account owners
        data = SalesData.objects.filter(
            posting_date__range=[start_date, end_date],
            account_owner__in=items,
            transaction_type='Actual'
        ).annotate(
            posting_year=ExtractYear('posting_date')
        ).values(
            'account_owner',
            'posting_year'
        ).annotate(
            total_sales=Sum('sales_amount')
        ).order_by('posting_year', 'account_owner')

        # Process data for chart
        years = sorted(list(set(entry['posting_year'] for entry in data)))
        values = {account_owner: [] for account_owner in items}

        # Initialize with zeros
        for account_owner in items:
            values[account_owner] = [0] * len(years)

        # Fill in actual values
        for entry in data:
            year_index = years.index(entry['posting_year'])
            values[entry['account_owner']][year_index] = float(entry['total_sales'])

        response = {
            'status': 'success',
            'years': years,
            'values': values
        }

        # Pretty-print the JSON response
        print("JSON Response:")
        print(json.dumps(response, indent=4))

        return JsonResponse(response)

    except Exception as e:
        # Handle exceptions and pretty-print the error response
        print(f"Error in compare_account_owners: {e}")
        response = {
            'status': 'error',
            'message': str(e)
        }
        print("JSON Error Response:")
        print(json.dumps(response, indent=4))  # Pretty-print error response
        return JsonResponse(response, status=500)


@login_required
def get_session_dates(request):
    """Retrieve dates from session"""
    return JsonResponse({
        'from_date': request.session.get('from_date'),
        'to_date': request.session.get('to_date')
    })

@login_required
@require_http_methods(["POST"])
def save_session_dates(request):
    """Save dates to session"""
    try:
        data = json.loads(request.body)
        request.session['from_date'] = data.get('from_date')
        request.session['to_date'] = data.get('to_date')
        return JsonResponse({'status': 'success'})
    except Exception as e:
        return JsonResponse({'status': 'error', 'message': str(e)}, status=400)

@login_required
@require_http_methods(["GET"])
def get_forecast_session(request):
    return JsonResponse({
        'from_date': request.session.get('forecast_from_date'),
        'to_date': request.session.get('forecast_to_date')
    })

@login_required
@require_http_methods(["POST"])
def save_forecast_session(request):
    data = json.loads(request.body)
    request.session['forecast_from_date'] = data.get('from_date')
    request.session['forecast_to_date'] = data.get('to_date')
    return JsonResponse({'status': 'success'})


def check_stationarity(data):
    """
    Check if the time series is stationary using ADF test
    Returns: dict with test results and boolean indicating stationarity
    """
    # Perform ADF test
    adf_result = adfuller(data[~np.isnan(data)])
    
    # Print detailed stationarity results
   
    for key, value in adf_result[4].items():
        print(f"\t{key}: {value:.4f}")
    
    # Data is considered stationary if p-value < 0.05
    is_stationary = adf_result[1] < 0.05
    
    return {
        'is_stationary': is_stationary,
        'adf_statistic': float(adf_result[0]),
        'p_value': float(adf_result[1]),
        'critical_values': adf_result[4]
    }


# Function to make the series stationary
def make_stationary(series, max_diff=5):
    """Continuously check and transform the data to become stationary."""
    diff_order = 0  # Initialize differencing order
    while diff_order <= max_diff:
        result = adfuller(series.dropna())
        p_value = result[1]
        if p_value <= 0.05:
            return series, diff_order
        else:
            series = series.diff()  # Apply differencing
            diff_order += 1
    
    return series, diff_order


def revenue_analytics(request):
    try:

        # Step 1: Fetch both revenue and cost data
        data = SalesData.objects.all().values('posting_date', 'sales_amount', 'cost_amount', 'transaction_type')

        if not data:
            return JsonResponse({
                'error': 'No data available.',
                'historical': {},
                'forecast': {}
            })

        data = pd.DataFrame(data)
        data = data[data['transaction_type'] == 'Actual']

        # Drop rows with missing data in key columns
        data = data.dropna(subset=['posting_date', 'sales_amount', 'cost_amount'])

        # Step 4: Convert 'posting_date' to datetime and amounts to numeric
        data['posting_date'] = pd.to_datetime(data['posting_date'], errors='coerce')
        data['sales_amount'] = pd.to_numeric(data['sales_amount'], errors='coerce')
        data['cost_amount'] = pd.to_numeric(data['cost_amount'], errors='coerce')
        data = data.dropna(subset=['posting_date', 'sales_amount', 'cost_amount'])

        # Step 5: Set 'posting_date' as index and resample data to fiscal quarters
        data.set_index('posting_date', inplace=True)
        fiscal_quarterly_sales = data['sales_amount'].resample('Q').sum()
        fiscal_quarterly_costs = data['cost_amount'].resample('Q').sum()

        # Process revenue forecasting
        quarterly_sales_values = fiscal_quarterly_sales.values
        stationary_sales, sales_differencing_order = make_stationary(fiscal_quarterly_sales)

        # Process cost forecasting
        quarterly_costs_values = fiscal_quarterly_costs.values
        stationary_costs, costs_differencing_order = make_stationary(fiscal_quarterly_costs)

        # Fit SARIMAX model for revenue
        sales_model = SARIMAX(
            quarterly_sales_values,
            order=(1, sales_differencing_order, 1),
            seasonal_order=(1, 1, 1, 4),
            enforce_stationarity=False,
            enforce_invertibility=False
        )
        sales_model_fit = sales_model.fit(disp=False)

        # Fit SARIMAX model for costs
        costs_model = SARIMAX(
            quarterly_costs_values,
            order=(1, costs_differencing_order, 1),
            seasonal_order=(1, 1, 1, 4),
            enforce_stationarity=False,
            enforce_invertibility=False
        )
        costs_model_fit = costs_model.fit(disp=False)

        
        # Forecast revenue
        forecast_sales = sales_model_fit.forecast(steps=4)
        # Forecast costs
        forecast_costs = costs_model_fit.forecast(steps=4)
        
        forecast_quarters = pd.date_range(
            start=fiscal_quarterly_sales.index[-1] + pd.Timedelta(days=1),
            periods=4,
            freq='Q'
        )

        # Prepare historical data
        historical_sales_data = fiscal_quarterly_sales.reset_index()
        historical_costs_data = fiscal_quarterly_costs.reset_index()
        
        historical_sales_data['year_quarter'] = historical_sales_data['posting_date'].dt.to_period('Q ').astype(str)
        historical_costs_data['year_quarter'] = historical_costs_data['posting_date'].dt.to_period('Q').astype(str)
        
        # Prepare data for response (original format for chart)
        historical = {f"{row['posting_date'].year} Q{row['posting_date'].quarter}": row['sales_amount'] 
                     for _, row in historical_sales_data.iterrows()}
        
        forecast_data = {f"{date.year} Q{date.quarter}": revenue 
                        for date, revenue in zip(forecast_quarters, forecast_sales)}

        # Prepare additional data for database only
        historical_costs = {f"{row['posting_date'].year} Q{row['posting_date'].quarter}": row['cost_amount'] 
                          for _, row in historical_costs_data.iterrows()}
        
        forecast_costs = {f"{date.year} Q{date.quarter}": cost 
                         for date, cost in zip(forecast_quarters, forecast_costs)}

        #  Save historical and forecast data
        with transaction.atomic():
            print("Deleting existing records.")
            RevenueAnalytics.objects.all().delete()

            # Reset auto-increment value
            reset_auto_increment()

            
            for quarter in historical.keys():
                year, quarter_num = quarter.split(' Q')
                revenue = historical.get(quarter, 0)
                cost = historical_costs.get(quarter, 0)
                net_margin = revenue - cost
                
                RevenueAnalytics.objects.create(
                    year=int(year),
                    quarter=f"Q{quarter_num}",
                    revenue_amount=revenue,
                    cost_amount=cost,
                    net_margin=net_margin,
                    is_forecast=False
                )

            
            for quarter in forecast_data.keys():
                year, quarter_num = quarter.split(' Q')
                revenue = forecast_data.get(quarter, 0)
                cost = forecast_costs.get(quarter, 0)
                net_margin = revenue - cost
                
                RevenueAnalytics.objects.create(
                    year=int(year),
                    quarter=f"Q{quarter_num}",
                    revenue_amount=revenue,
                    cost_amount=cost,
                    net_margin=net_margin,
                    is_forecast=True
                )

        # Return response in original format for chart compatibility
        response_data = {
            'historical': historical,
            'forecast': forecast_data,
        }
        return JsonResponse(response_data)

    except Exception as e:
        print(f"Error: {str(e)}")
        return JsonResponse({
            'error': str(e),
            'historical': {},
            'forecast': {}
        })
    
def sales_forecasting_view(request):
    # Parse date range from request (if provided)
    from_date_str = request.GET.get('from_date', None)
    to_date_str = request.GET.get('to_date', None)
    
    # Calculate total forecasted sales by summing all forecasted revenue amounts
    total_forecasted_sales = RevenueAnalytics.objects.filter(
        is_forecast=1  # Filter by forecasted data
    ).aggregate(
        total_sales=Sum('revenue_amount')
    )['total_sales'] or Decimal('0')
    
    # Calculate sales forecast percentage
    try:
        # Get all forecasted revenue amounts
        forecasted_revenue_amounts = list(
            RevenueAnalytics.objects.filter(is_forecast=1)  # Filter by forecasted data
            .values_list('revenue_amount', flat=True)
        )
        
        if len(forecasted_revenue_amounts) > 1:
            # Calculate sales forecast percentage based on forecasted data
            sales_forecast_percentage = (
                (forecasted_revenue_amounts[-1] - forecasted_revenue_amounts[0]) / 
                forecasted_revenue_amounts[0]
            ) * Decimal('100')
            
            # Round to 2 decimal places
            sales_forecast_percentage = sales_forecast_percentage.quantize(Decimal('0.01'))
        else:
            sales_forecast_percentage = Decimal('0.00')
    except Exception as e:
        print(f"Error calculating sales forecast percentage: {e}")
        sales_forecast_percentage = Decimal('0.00')
    
    # Calculate other metrics
    historical_cagr = calculate_cagr('historical')
    forecast_cagr = calculate_cagr('forecast')
    net_margin_change = calculate_net_margin()
    
    # Prepare response data
    response_data = {
        'total_sales': total_forecasted_sales,
        'sales_change_percentage': float(sales_forecast_percentage),  # Convert to float for JSON serialization
        'from_date': from_date_str,
        'to_date': to_date_str,
        'historical_cagr': historical_cagr,
        'forecast_cagr': forecast_cagr,
        'net_margin_change': net_margin_change,
    }
    
    return JsonResponse(response_data)
    

def calculate_cagr(period_type):
    """
    Calculate the Compound Annual Growth Rate (CAGR) for historical or forecast data.
    :param period_type: 'historical' or 'forecast'
    :return: CAGR as a percentage rounded to 2 decimal places or None if not enough data
    """
    # Determine the min and max years dynamically
    min_year = RevenueAnalytics.objects.filter(is_forecast=False).aggregate(Min('year'))['year__min']
    max_year = RevenueAnalytics.objects.filter(is_forecast=False).aggregate(Max('year'))['year__max']
    
    forecast_max_year = RevenueAnalytics.objects.filter(is_forecast=True).aggregate(Max('year'))['year__max']

    if period_type == 'historical':
        year_range = [min_year, max_year] if min_year and max_year else None
        is_forecast = False  # Only consider actual historical data
    elif period_type == 'forecast':
        year_range = [max_year, forecast_max_year] if max_year and forecast_max_year else None
        is_forecast = None  # Include both historical and forecasted data
    else:
        return None

    if not year_range:
        return None  # No valid data range found

    # Filter RevenueAnalytics based on the `is_forecast` field and year range
    if is_forecast is None:
        revenue_data = RevenueAnalytics.objects.filter(
            year__range=year_range
        ).order_by('year', 'quarter')
    else:
        revenue_data = RevenueAnalytics.objects.filter(
            is_forecast=is_forecast,
            year__range=year_range
        ).order_by('year', 'quarter')

    # Check if there is enough data
    if revenue_data.count() < 2:
        return None  # Not enough data to calculate CAGR

    # Create a DataFrame from the filtered queryset
    df = pd.DataFrame(list(revenue_data.values('year', 'quarter', 'revenue_amount')))

    # Group the data by year and sum the revenue for each year
    df_grouped = df.groupby('year')['revenue_amount'].sum().reset_index()

    # Print years and their corresponding revenue amounts
    for index, row in df_grouped.iterrows():
        print(f"Year: {row['year']}, Revenue: {row['revenue_amount']}")

    # Calculate CAGR using the grouped data
    first_revenue = df_grouped['revenue_amount'].iloc[0]
    last_revenue = df_grouped['revenue_amount'].iloc[-1]
    years = len(df_grouped) - 1  # Number of years between the first and last entry

    # Handle division by zero if there is only one year of data
    if years == 0:
        return None  # Not enough years to calculate CAGR

    # Convert to float before performing the exponentiation
    first_revenue_float = float(first_revenue)
    last_revenue_float = float(last_revenue)

    # Calculate CAGR
    cagr = (last_revenue_float / first_revenue_float) ** (1 / years) - 1

    return round(cagr * 100, 2)  # Return CAGR as a percentage rounded to 2 decimal places

def calculate_net_margin():
    """
    Calculate the Net Margin percentage from the fctapp_revenueanalytics table for forecasted data.
    Net Margin = ((Total Revenue Amount - Total Cost Amount) / Total Revenue Amount) * 100
    """
    # Fetch only forecasted revenue analytics data ordered by year and quarter
    revenue_data = RevenueAnalytics.objects.filter(
        is_forecast=1  # Only forecasted data
    ).order_by('year', 'quarter')

    # Check if there is any data
    if not revenue_data.exists():
        return None  # No data to calculate Net Margin

    # Create a DataFrame from the filtered queryset
    df = pd.DataFrame(list(revenue_data.values('revenue_amount', 'cost_amount')))

    # Ensure the DataFrame is not empty
    if df.empty:
        return None  # No data to calculate

    # Calculate total revenue amount and total cost amount
    total_revenue = df['revenue_amount'].sum()
    total_cost = df['cost_amount'].sum()

    # Handle division by zero if total_revenue is 0
    if total_revenue == 0:
        return None  # Division by zero is not allowed

    # Calculate Net Margin percentage
    net_margin_percentage = ((total_revenue - total_cost) / total_revenue) * 100

    return round(net_margin_percentage, 2)  # Round to 2 decimal places

def reset_auto_increment():
    with connection.cursor() as cursor:
        cursor.execute("ALTER TABLE fctapp_revenueanalytics AUTO_INCREMENT = 1;")
        cursor.execute("ALTER TABLE fctapp_volumeforecasting AUTO_INCREMENT = 1;")


def make_stationary(series):
    """ Differencing function to make the series stationary """
    differencing_order = 0
    while series.diff().dropna().var() > 0.01 and differencing_order < 2:
        series = series.diff().dropna()
        differencing_order += 1
    return series, differencing_order

def forecasting(request):
    # Fetch distinct values
    product_names = SalesData.objects.values_list('product_name', flat=True).distinct()
    regions = SalesData.objects.values_list('region', flat=True).distinct()
    account_owners = SalesData.objects.values_list('account_owner', flat=True).distinct()
    product_families = SalesData.objects.values_list('product_family', flat=True).distinct()
    
    # Get start_date and end_date from request
    start_date = request.GET.get('start_date', '')
    end_date = request.GET.get('end_date', '')

    # Set default filtered values
    filtered_products = product_names
    filtered_regions = regions
    filtered_account_owners = account_owners
    filtered_product_families = product_families

    if start_date and end_date:
        try:
            start_date = datetime.strptime(start_date, "%Y-%m-%d").date()
            end_date = datetime.strptime(end_date, "%Y-%m-%d").date()

            # Filter based on date range
            filtered_products = SalesData.objects.filter(
                posting_date__range=(start_date, end_date),
                product_name__isnull=False
            ).values_list('product_name', flat=True).distinct()

            filtered_regions = SalesData.objects.filter(
                posting_date__range=(start_date, end_date),
                region__isnull=False
            ).values_list('region', flat=True).distinct()

            filtered_account_owners = SalesData.objects.filter(
                posting_date__range=(start_date, end_date),
                account_owner__isnull=False
            ).values_list('account_owner', flat=True).distinct()

            filtered_product_families = SalesData.objects.filter(
                posting_date__range=(start_date, end_date),
                product_family__isnull=False
            ).values_list('product_family', flat=True).distinct()
            print(f"Filtered Account Owners ({start_date} to {end_date}):", list(filtered_account_owners))
            print(f"Filtered Product Families ({start_date} to {end_date}):", list(filtered_product_families))

        except ValueError:
            print("Invalid date format. Please use YYYY-MM-DD.")

    # Prepare context with JSON data
    context = {
        'product_names': json.dumps(list(filtered_products), ensure_ascii=False),
        'regions': json.dumps(list(filtered_regions), ensure_ascii=False),
        'account_owners': json.dumps(list(filtered_account_owners), ensure_ascii=False),
        'product_families': json.dumps(list(filtered_product_families), ensure_ascii=False),
        'product_count': len(filtered_products),
        'region_count': len(filtered_regions),
        'account_owner_count': len(filtered_account_owners),
        'product_family_count': len(filtered_product_families),
        'start_date': start_date,
        'end_date': end_date,
    }

    return render(request, 'forecasting.html', context)

def get_product_data(request):
    product_name = request.GET.get('product_name')
    region = request.GET.get('region')  # Region from request; can be None
    account_owner = request.GET.get('account_owner')  # Account owner from request; can be None
    product_family = request.GET.get('product_family')  # Product family from request; can be None

    print(f"Received request: product_name={product_name}, region={region}, account_owner={account_owner}, product_family={product_family}")

    if not product_name:
        print("Error: No product selected")
        return JsonResponse({'error': 'No product selected'}, status=400)

    reset_auto_increment()

    # Apply filters based on product_name, region, account_owner, and product_family
    filters = {
        'posting_date__year': 2024,
        'product_name': product_name,
        'quantity_base__isnull': False,
    }

    if region:
        filters['region'] = region
    if account_owner:
        filters['account_owner'] = account_owner
    if product_family:
        filters['product_family'] = product_family

    print(f"Filters applied: {filters}")

    # Query SalesData with the applied filters
    sales_data = SalesData.objects.filter(**filters).values('posting_date', 'quantity_base')

    if not sales_data.exists():
        print(f"No sales data found for {product_name} in {region}, {account_owner}, {product_family}")
        return JsonResponse({'error': f'No sales data available for {product_name} in {region}, {account_owner}, {product_family}'}, status=404)

    df = pd.DataFrame(list(sales_data))
    print("Fetched Sales Data:", df)

    df['posting_date'] = pd.to_datetime(df['posting_date'])
    df.set_index('posting_date', inplace=True)
    df['quantity_base'] = df['quantity_base'].astype(float)

    # Resample data quarterly
    quarterly_quantity = df['quantity_base'].resample('Q').sum()
    print("Quarterly Resampled Data:", quarterly_quantity)

    if len(quarterly_quantity) < 4:
        print("Error: Not enough data for forecasting")
        return JsonResponse({'error': 'Not enough data for forecasting'}, status=400)

    # Make the data stationary
    stationary_series, differencing_order = make_stationary(quarterly_quantity)
    print(f"Stationary Data: {stationary_series}, Differencing Order: {differencing_order}")

    # Fit ARIMA model
    model = ARIMA(quarterly_quantity, order=(1, differencing_order, 1))
    model_fit = model.fit()

    # Forecast the next 4 quarters
    forecast = model_fit.forecast(steps=4)
    print("Forecasted Values:", forecast)

    # Delete old forecasts for this product, region, account owner, and product family
    VolumeForecasting.objects.filter(
        product_name=product_name,
        region=region,
        account_owner=account_owner,
        product_family=product_family
    ).delete()

    print("Deleted old forecasts for product:", product_name, "region:", region, "account_owner:", account_owner, "product_family:", product_family)

    # Save historical and forecasted data
    historical_data = [
        {"year": index.year, "quarter": f"Q{index.quarter}", "value": val}
        for index, val in zip(quarterly_quantity.index, quarterly_quantity.values)
    ]

    last_year = quarterly_quantity.index[-1].year
    last_quarter = quarterly_quantity.index[-1].quarter

    future_data = []
    for i, forecast_value in enumerate(forecast):
        next_quarter = last_quarter + i + 1
        next_year = last_year
        if next_quarter > 4:
            next_quarter -= 4
            next_year += 1
        future_data.append({"year": next_year, "quarter": f"Q{next_quarter}", "value": forecast_value})

    print("Historical Data:", historical_data)
    print("Future Forecast Data:", future_data)

    # Save historical data (include region, account_owner, product_family)
    for item in historical_data:
        VolumeForecasting.objects.create(
            product_name=product_name,
            region=region,
            account_owner=account_owner,
            product_family=product_family,
            quarter=f"{item['year']}-{item['quarter']}",
            is_forecast=False,
            historical_quantity=item['value'],
            forecast_quantity=0
        )

    # Save forecast data (include region, account_owner, product_family)
    for item in future_data:
        VolumeForecasting.objects.create(
            product_name=product_name,
            region=region,
            account_owner=account_owner,
            product_family=product_family,
            quarter=f"{item['year']}-{item['quarter']}",
            is_forecast=True,
            historical_quantity=0,
            forecast_quantity=item['value']
        )

    # Retrieve the forecasted data for chart display
    data = VolumeForecasting.objects.filter(
        product_name=product_name,
        region=region,
        account_owner=account_owner,
        product_family=product_family
    ).values('quarter', 'historical_quantity', 'forecast_quantity', 'is_forecast')

    labels, historical_values, forecast_values = [], [], []
    historical_2024Q4_value = None
    for entry in data:
        labels.append(entry['quarter'])

        if entry['quarter'] == '2024-Q4' and not entry['is_forecast']:
            historical_2024Q4_value = entry['historical_quantity']

        historical_values.append(entry['historical_quantity'] if not entry['is_forecast'] else None)
        forecast_values.append(entry['forecast_quantity'] if entry['is_forecast'] else None)

    # Ensure forecast for 2024-Q4 matches historical value if available
    if historical_2024Q4_value is not None:
        for i, quarter in enumerate(labels):
            if quarter == '2024-Q4' and (forecast_values[i] is None or forecast_values[i] == 0):
                forecast_values[i] = historical_2024Q4_value

    response_data = {
        'product_name': product_name,
        'region': region,
        'account_owner': account_owner,
        'product_family': product_family,
        'labels': labels,
        'historical_data': historical_values,
        'forecast_data': forecast_values,
    }

    return JsonResponse(response_data)
