# FCT Tool

FCT Tool is a Django-based web application designed to manage and analyze sales data efficiently.

## Getting Started

Follow these instructions to set up the project and run it locally.

---

## Prerequisites

Ensure you have the following installed on your system:

- Python (>= 3.12.6)
- Django (>= 5.1.2)
- Import Pandas
- MySQL Server (configured with database credentials)
- MySQL client (`mysql` command-line tool)
- Virtual environment tools (`venv` or similar)

---

## Project Setup

### 1. Start the MySQL Database Server
To ensure the application can connect to the database, start the MySQL database server:

#### For Linux:
```bash
sudo systemctl start mysqld
```

#### For macOS (Homebrew):
```bash
brew services start mysql
```

#### Verify Database Connection:
Log in to MySQL with the following command:
```bash
mysql -u admin -p
```
Enter the password: `admin@123`. Confirm that the database `fctapp` exists:
```sql
SHOW DATABASES;
```

---

### 2. Clone the Repository
Clone this repository to your local machine:
```bash
git clone <repository-url>
cd fct_tool/fct/fct_git
```

---

### 3. Set Up the Virtual Environment
Create and activate a virtual environment:
```bash
python -m venv venv
source venv/bin/activate   # On Linux/macOS
venv\Scripts\activate      # On Windows
```

Install the required Python dependencies:
```bash
pip install -r requirements.txt
```

---

### 4. Configure the Database
Check the `settings.py` file for the database configuration under the `DATABASES` section. Ensure the following details match your MySQL setup:
```python
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.mysql',
        'NAME': 'fctapp',
        'USER': 'admin',
        'PASSWORD': 'admin@123',
        'HOST': 'localhost',
        'PORT': '3306',
    }
}
```

---

### 5. Run Migrations
Apply the database migrations:
```bash
python manage.py makemigrations
python manage.py migrate
```

---

### 6. Create a Superuser
To access the Django admin interface, create a superuser:
```bash
python manage.py createsuperuser
```
Follow the prompts to set up the username, email, and password.

---

### 7. Run the Development Server
Start the development server:
```bash
python manage.py runserver
```
Access the application in your browser at: [http://127.0.0.1:8000](http://127.0.0.1:8000)

---

