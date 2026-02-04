# Excel Export Styling Guide

This document describes the exact styling format used for STOA Group Excel exports. Use this as a reference when creating similar styled Excel reports.

## Color Palette (ARGB Format)

ExcelJS uses ARGB format (Alpha-Red-Green-Blue) where colors are specified as 8-character hex strings with `FF` prefix:

```javascript
const brandColors = {
    primaryGreen: 'FF7E8A6B',      // #7e8a6b (dark green - used for title background and subtitle text)
    secondaryGreen: 'FFA6AD8A',     // #a6ad8a (light green - used for header row background)
    secondaryGrey: 'FFEFEFF1',      // #efeff1 (light grey - used for alternating row backgrounds)
    white: 'FFFFFFFF',             // #ffffff (white background)
    textPrimary: 'FF1F2937',       // #1f2937 (dark grey - primary text color)
    textSecondary: 'FF6B7280',      // #6b7280 (medium grey - secondary text like dates)
    borderColor: 'FFE5E7EB',      // #e5e7eb (light grey - cell borders)
    darkGrey: 'FFD3D3D3'          // #d3d3d3 (darker grey - total row background)
};
```

## Worksheet Structure

### Row Layout (Top to Bottom):

1. **Title Row (Row 1)**
   - Text: "STOA Group - Deal Pipeline Report"
   - Merged across all columns
   - Font: Arial, 24pt, Bold, White (#FFFFFF)
   - Background: Primary Green (#7e8a6b)
   - Alignment: Center (horizontal), Middle (vertical)
   - Height: 30

2. **Subtitle Row (Row 2)**
   - Text: "[Stage Name] Deals" (e.g., "Under Contract Deals")
   - Merged across all columns
   - Font: Arial, 18pt, Bold, Primary Green (#7e8a6b)
   - Background: White (#FFFFFF)
   - Alignment: Center (horizontal), Middle (vertical)
   - Height: 22

3. **Date Row (Row 3)**
   - Text: "Generated: [Date and Time]" (e.g., "Generated: January 15, 2024, 02:30 PM")
   - Merged across all columns
   - Font: Arial, 11pt, Regular, Text Secondary (#6b7280)
   - Background: White (#FFFFFF)
   - Alignment: Center (horizontal), Middle (vertical)
   - Height: 18

4. **Blank Row (Row 4)**
   - Empty row for spacing
   - Height: 5

5. **Header Row (Row 5)**
   - Contains column names
   - Font: Arial, 11pt, Bold, Black (#000000)
   - Background: Secondary Green (#a6ad8a)
   - Alignment: Center (horizontal), Middle (vertical), Wrap Text enabled
   - Borders: Thin borders on all sides (Top, Bottom, Left, Right) in Border Color (#e5e7eb)
   - Height: 25

6. **Data Rows (Row 6+)**
   - Alternating row colors (banded rows):
     - Even rows (0, 2, 4...): White (#FFFFFF)
     - Odd rows (1, 3, 5...): Secondary Grey (#efeff1)
   - Font: Arial, 10pt, Regular, Text Primary (#1f2937)
   - Alignment:
     - First column (Project Name): Left
     - All other columns: Center
     - Vertical: Middle
     - Wrap Text: Enabled
   - Borders: Thin borders on all sides in Border Color (#e5e7eb)
   - Height: 20
   - Special handling for Location column: Hyperlinks to Google Maps (blue, underlined)

7. **Total Row (Last Row)**
   - First column: "TOTAL"
   - Other columns: Calculated totals (Units, Acreage, Land Price) or empty
   - Font: Arial, 11pt, Bold, Text Primary (#1f2937)
   - Background: Dark Grey (#d3d3d3)
   - Alignment:
     - First column: Left
     - All other columns: Center
     - Vertical: Middle
     - Wrap Text: Enabled
   - Borders: Thin borders on all sides in Border Color (#e5e7eb)
   - Height: 20

## Cell Formatting Details

### Font Specifications:
- **Title**: Arial, 24pt, Bold, White
- **Subtitle**: Arial, 18pt, Bold, Primary Green
- **Date**: Arial, 11pt, Regular, Text Secondary
- **Headers**: Arial, 11pt, Bold, Black
- **Data**: Arial, 10pt, Regular, Text Primary
- **Total**: Arial, 11pt, Bold, Text Primary
- **Hyperlinks**: Arial, 10pt, Regular, Blue (#0000FF), Underlined

### Fill (Background) Patterns:
All fills use `type: 'pattern'` with `pattern: 'solid'`:
- Title: Primary Green background
- Subtitle: White background
- Date: White background
- Headers: Secondary Green background
- Data (even rows): White background
- Data (odd rows): Secondary Grey background
- Total: Dark Grey background

### Borders:
All borders use `style: 'thin'` and `color: { argb: borderColor }`:
- Applied to: Top, Bottom, Left, Right
- Border Color: #e5e7eb (light grey)

### Alignment:
- **Title/Subtitle/Date**: Center horizontal, Middle vertical
- **Headers**: Center horizontal, Middle vertical, Wrap Text
- **Data (First Column)**: Left horizontal, Middle vertical, Wrap Text
- **Data (Other Columns)**: Center horizontal, Middle vertical, Wrap Text
- **Total (First Column)**: Left horizontal, Middle vertical, Wrap Text
- **Total (Other Columns)**: Center horizontal, Middle vertical, Wrap Text

## Column Widths

Column widths are calculated dynamically based on content with minimum widths:

```javascript
const minWidths = {
    'Project Name': 25,
    'City': 15,
    'State': 8,
    'Region': 15,
    'Bank': 20,
    'Start Date': 15,
    'Due Diligence Date': 20,
    'Closing Date': 15,
    'Land Price': 18,
    'Sq Ft Price': 12,
    'Location': 25
};
```

Width calculation:
1. Check header text length
2. Check all data cell lengths in that column
3. Check total row value length
4. Use maximum of: minWidth, (maxContentLength + 2), capped at 60

## Special Features

### Hyperlinks
- Location column contains clickable hyperlinks to Google Maps
- Format: `{ text: "Location Text", hyperlink: "https://www.google.com/maps?q=..." }`
- Font: Blue (#0000FF), Underlined
- Priority for link creation:
  1. Latitude/Longitude coordinates (if available)
  2. Full address (if available)
  3. City, State (fallback)

### Date Formatting
Dates are formatted as: "Jan 15, 2024" (month abbreviation, day, year)
Format: `new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })`

### Currency Formatting
- Land Price: `$${parseFloat(value).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
  - Example: $1,500,000
- Sq Ft Price: `$${parseFloat(value).toFixed(2)}`
  - Example: $45.67

### Number Formatting
- Units: Plain number (e.g., 288)
- Acreage: Decimal with 2 places (e.g., 12.50)

## Worksheet Settings

- **Frozen Rows**: First 5 rows are frozen (title, subtitle, date, blank, header)
  - `worksheet.views = [{ state: 'frozen', ySplit: 5 }]`

## Multiple Worksheets

When multiple stages are selected:
- Each stage gets its own worksheet (tab)
- Worksheet name = Stage name
- All worksheets follow the same styling format
- Worksheets are created in the order: Prospective, Under Contract, Under Construction, Lease-Up, Stabilized, Liquidated, Commercial Land - Listed, Dead, Other

## Example Code Structure

```javascript
// 1. Create workbook
const workbook = new ExcelJS.Workbook();
const worksheet = workbook.addWorksheet('Sheet Name');

// 2. Add title row
const titleRow = worksheet.addRow(['STOA Group - Deal Pipeline Report']);
worksheet.mergeCells(1, 1, 1, numColumns);
titleRow.getCell(1).font = { name: 'Arial', size: 24, bold: true, color: { argb: 'FFFFFFFF' } };
titleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7E8A6B' } };
titleRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
titleRow.height = 30;

// 3. Add subtitle row
const subtitleRow = worksheet.addRow(['Subtitle Text']);
worksheet.mergeCells(2, 1, 2, numColumns);
subtitleRow.getCell(1).font = { name: 'Arial', size: 18, bold: true, color: { argb: 'FF7E8A6B' } };
subtitleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
subtitleRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
subtitleRow.height = 22;

// 4. Add date row
const dateRow = worksheet.addRow([`Generated: ${new Date().toLocaleDateString(...)}`]);
worksheet.mergeCells(3, 1, 3, numColumns);
dateRow.getCell(1).font = { name: 'Arial', size: 11, color: { argb: 'FF6B7280' } };
dateRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
dateRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
dateRow.height = 18;

// 5. Add blank row
worksheet.addRow([]);
worksheet.getRow(4).height = 5;

// 6. Add header row
const headerRow = worksheet.addRow(columnNames);
headerRow.eachCell((cell) => {
    cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF000000' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFA6AD8A' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = {
        top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        right: { style: 'thin', color: { argb: 'FFE5E7EB' } }
    };
});
headerRow.height = 25;

// 7. Add data rows with banded colors
data.forEach((rowData, rowIndex) => {
    const row = worksheet.addRow(Object.values(rowData));
    const isEvenRow = rowIndex % 2 === 0;
    const bgColor = isEvenRow ? 'FFFFFFFF' : 'FFEFEFF1';
    
    row.eachCell((cell, colNumber) => {
        cell.font = { name: 'Arial', size: 10, color: { argb: 'FF1F2937' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
        cell.alignment = { 
            horizontal: colNumber === 1 ? 'left' : 'center', 
            vertical: 'middle',
            wrapText: true
        };
        cell.border = {
            top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
            bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
            left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
            right: { style: 'thin', color: { argb: 'FFE5E7EB' } }
        };
    });
    row.height = 20;
});

// 8. Add total row
const totalRow = worksheet.addRow(totalValues);
totalRow.eachCell((cell) => {
    cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF1F2937' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD3D3D3' } };
    cell.alignment = { 
        horizontal: cell.col === 1 ? 'left' : 'center', 
        vertical: 'middle',
        wrapText: true
    };
    cell.border = {
        top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        right: { style: 'thin', color: { argb: 'FFE5E7EB' } }
    };
});
totalRow.height = 20;

// 9. Set column widths
columnKeys.forEach((key, index) => {
    // Calculate width based on content...
    worksheet.getColumn(index + 1).width = finalWidth;
});

// 10. Freeze header rows
worksheet.views = [{ state: 'frozen', ySplit: 5 }];
```

## Key Points for Replication

1. **Color Format**: Always use ARGB format with `FF` prefix (e.g., `FF7E8A6B` not `#7e8a6b`)
2. **Font Family**: Always use 'Arial'
3. **Banded Rows**: Alternate white and light grey for data rows
4. **Borders**: All cells have thin borders in light grey
5. **Alignment**: First column left-aligned, others center-aligned
6. **Row Heights**: Title (30), Subtitle (22), Date (18), Blank (5), Header (25), Data (20), Total (20)
7. **Frozen Rows**: First 5 rows frozen for scrolling
8. **Merged Cells**: Title, subtitle, and date rows merged across all columns
