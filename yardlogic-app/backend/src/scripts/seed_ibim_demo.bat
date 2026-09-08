@echo off
REM seed_ibim_demo.bat
REM Quick helper to seed iBIM demo data (Windows)
REM Usage: seed_ibim_demo.bat <business_id> [db_host] [db_user] [db_name]

setlocal enabledelayedexpansion

if "%1"=="" (
    echo Usage: %0 business_id [db_host] [db_user] [db_name]
    echo.
    echo Find your iBIM business ID with:
    echo   psql -h your-host -U your_user -d your_database -c "SELECT id, name FROM \"Business\" WHERE \"applicationId\" = 'IBIM';"
    echo.
    echo Example:
    echo   %0 2197c8f8-f0bf-48e4-bf65-8d01278a341d localhost postgres yardlogic
    exit /b 1
)

set BUSINESS_ID=%1
set DB_HOST=%2
if "%DB_HOST%"=="" set DB_HOST=localhost

set DB_USER=%3
if "%DB_USER%"=="" set DB_USER=postgres

set DB_NAME=%4
if "%DB_NAME%"=="" set DB_NAME=yardlogic

echo.
echo 🌱 Seeding iBIM demo data...
echo    Business ID: %BUSINESS_ID%
echo    Database: %DB_HOST% / %DB_NAME%
echo.

REM Get the directory of this script
set SCRIPT_DIR=%~dp0

REM Run the seed script with the business ID variable
psql -h %DB_HOST% -U %DB_USER% -d %DB_NAME% -v business_id=%BUSINESS_ID% -f "%SCRIPT_DIR%seed_ibim_demo_flexible.sql"

if %errorlevel% equ 0 (
    echo.
    echo ✅ iBIM demo data seeded successfully!
    echo.
    echo To verify in your dashboard:
    echo   - Log in to your iBIM business
    echo   - Navigate to Members section
    echo   - You should see 100 members with references starting with DEMO-
) else (
    echo.
    echo ❌ Error seeding demo data. Check your database credentials and connection.
)

pause
