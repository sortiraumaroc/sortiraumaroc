#!/usr/bin/env python3
import re
import sys

def invert_colors(content):
    """Invert dark theme colors to light theme"""
    # Order matters! Do compound patterns first
    replacements = [
        # First pass: protect certain patterns
        (r'bg-black(?!/)', 'BG_BLACK_TEMP'),
        (r'text-white(?!/)', 'TEXT_WHITE_TEMP'),
        (r'border-white', 'border-black'),
        (r'hover:bg-white', 'hover:bg-black'),
        (r'hover:text-white', 'hover:text-black'),
        
        # Second pass: opacity colors
        (r'BG_BLACK_TEMP/(\d+)', r'bg-white/\1'),
        (r'BG_BLACK_TEMP(?!/)', 'bg-white'),
        (r'TEXT_WHITE_TEMP/(\d+)', r'text-black/\1'),
        (r'TEXT_WHITE_TEMP(?!/)', 'text-black'),
        
        # Handle bg-white/X -> bg-black/X inversions
        (r'bg-white/(\d+)', r'bg-black/\1'),
        
        # Sam red text color
        (r'bg-sam-red text-white', 'bg-sam-red text-black'),
        (r'text-white hover:text-white', 'text-black hover:text-black'),
    ]
    
    for pattern, replacement in replacements:
        content = re.sub(pattern, replacement, content)
    
    return content

if __name__ == '__main__':
    file_path = sys.argv[1]
    with open(file_path, 'r') as f:
        content = f.read()
    
    inverted = invert_colors(content)
    
    with open(file_path, 'w') as f:
        f.write(inverted)
    
    print(f"✓ Inverted colors in {file_path}")
