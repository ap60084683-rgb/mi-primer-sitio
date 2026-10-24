@echo off
tailwindcss-windows-x64.exe -i css\entrada.css -o "%USERPROFILE%\tailwind-temp.css" --minify
copy /Y "%USERPROFILE%\tailwind-temp.css" css\tailwind.css
pause