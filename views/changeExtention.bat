@echo off
set /p new_ext="Enter new extension (without dot): "
if "%new_ext%"=="" exit /b

for %%f in (*.*) do (
    if not "%%f"=="%~nx0" (
        ren "%%f" "%%~nf.%new_ext%"
    )
)
echo Done!
pause