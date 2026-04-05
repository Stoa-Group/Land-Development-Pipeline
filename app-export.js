/**
 * app-export.js — Excel export: stage/type selection modals, performExport
 * Plain <script> (not ES module). Relies on globals set by main.js state proxy.
 */

/* jshint esversion: 11 */

async function exportPipelineToExcel() {
    try {
        // Check if ExcelJS is loaded
        if (typeof ExcelJS === 'undefined') {
            showToast('Excel library not loaded. Please refresh the page and try again.', 'error');
            return;
        }

        // Show stage selection modal first
        showExportStageModal();
    } catch (error) {
        console.error('Error starting export:', error);
        showToast('Failed to start export. Please try again. Error: ' + error.message, 'error');
    }
}

// Show export stage selection modal
function showExportStageModal() {
    const modal = document.getElementById('export-stage-modal');
    const checkboxesContainer = document.getElementById('export-stage-checkboxes');
    
    if (!modal || !checkboxesContainer) {
        showToast('Export modal not found. Please refresh the page.', 'error');
        return;
    }
    
    // Use single source of truth for stage order (add Lease-Up, Other if needed for export)
    const stages = [...STAGE_DISPLAY_ORDER];
    if (!stages.includes('Lease-Up')) stages.push('Lease-Up');
    if (!stages.includes('Other')) stages.push('Other');
    
    // Populate checkboxes
    checkboxesContainer.innerHTML = stages.map(stage => `
        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; padding: 8px; border: 1px solid var(--border-color); border-radius: 4px;">
            <input type="checkbox" value="${stage}" class="export-stage-checkbox" style="width: auto;">
            <span>${stage}</span>
        </label>
    `).join('');
    
    // Show modal
    modal.style.display = 'flex';
    
    // Setup event listeners
    const updateContinueButton = () => {
        const continueBtn = document.getElementById('continue-export-stage-btn');
        if (continueBtn) {
            const checked = checkboxesContainer.querySelectorAll('.export-stage-checkbox:checked');
            continueBtn.disabled = checked.length === 0;
        }
    };
    
    // Use event delegation for checkboxes
    checkboxesContainer.addEventListener('change', (e) => {
        if (e.target.classList.contains('export-stage-checkbox')) {
            updateContinueButton();
        }
    });
    
    // Get button references
    const continueBtn = document.getElementById('continue-export-stage-btn');
    const cancelBtn = document.getElementById('cancel-export-stage-btn');
    const closeBtn = document.getElementById('close-export-stage-modal');
    
    // Remove any existing listeners by removing and re-adding
    const handleContinueClick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        if (continueBtn && continueBtn.disabled) {
            return;
        }
        
        const selectedStages = Array.from(checkboxesContainer.querySelectorAll('.export-stage-checkbox:checked'))
            .map(cb => cb.value);
        
        if (selectedStages.length === 0) {
            showToast('Please select at least one stage to export.', 'info');
            return;
        }
        
        modal.style.display = 'none';
        showExportTypeModal(selectedStages);
    };
    
    const handleCancelClick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        modal.style.display = 'none';
    };
    
    // Remove old listeners if they exist
    if (continueBtn && continueBtn._exportHandler) {
        continueBtn.removeEventListener('click', continueBtn._exportHandler);
    }
    if (cancelBtn && cancelBtn._exportHandler) {
        cancelBtn.removeEventListener('click', cancelBtn._exportHandler);
    }
    if (closeBtn && closeBtn._exportHandler) {
        closeBtn.removeEventListener('click', closeBtn._exportHandler);
    }
    
    // Add new listeners
    if (continueBtn) {
        continueBtn._exportHandler = handleContinueClick;
        continueBtn.addEventListener('click', handleContinueClick);
    }
    if (cancelBtn) {
        cancelBtn._exportHandler = handleCancelClick;
        cancelBtn.addEventListener('click', handleCancelClick);
    }
    if (closeBtn) {
        closeBtn._exportHandler = handleCancelClick;
        closeBtn.addEventListener('click', handleCancelClick);
    }
    
    updateContinueButton();
}

// Show export type selection modal
function showExportTypeModal(selectedStages) {
    const modal = document.getElementById('export-type-modal');
    
    if (!modal) {
        showToast('Export type modal not found. Please refresh the page.', 'error');
        return;
    }
    
    modal.style.display = 'flex';
    
    // Get button references
    const continueBtn = document.getElementById('continue-export-type-btn');
    const cancelBtn = document.getElementById('cancel-export-type-btn');
    const closeBtn = document.getElementById('close-export-type-modal');
    
    const handleContinueClick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const exportType = document.querySelector('input[name="export-type"]:checked')?.value || 'internal';
        modal.style.display = 'none';
        performExport(selectedStages, exportType);
    };
    
    const handleCancelClick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        modal.style.display = 'none';
    };
    
    // Remove old listeners if they exist
    if (continueBtn && continueBtn._exportHandler) {
        continueBtn.removeEventListener('click', continueBtn._exportHandler);
    }
    if (cancelBtn && cancelBtn._exportHandler) {
        cancelBtn.removeEventListener('click', cancelBtn._exportHandler);
    }
    if (closeBtn && closeBtn._exportHandler) {
        closeBtn.removeEventListener('click', closeBtn._exportHandler);
    }
    
    // Add new listeners
    if (continueBtn) {
        continueBtn._exportHandler = handleContinueClick;
        continueBtn.addEventListener('click', handleContinueClick);
    }
    if (cancelBtn) {
        cancelBtn._exportHandler = handleCancelClick;
        cancelBtn.addEventListener('click', handleCancelClick);
    }
    if (closeBtn) {
        closeBtn._exportHandler = handleCancelClick;
        closeBtn.addEventListener('click', handleCancelClick);
    }
}

// Perform the actual export
async function performExport(selectedStages, exportType) {
    try {

        // Show loading indicator
        const exportBtn = document.getElementById('export-pipeline-btn');
        const originalText = exportBtn ? exportBtn.textContent : '';
        if (exportBtn) {
            exportBtn.disabled = true;
            exportBtn.textContent = 'Refreshing data...';
        }

        try {
            // Refresh data from API before exporting (use API for latest data)
            console.log('Refreshing deal pipeline data before export...');
            
            const response = await API.getAllDealPipelines({ forceApi: true });
            if (!response.success) {
                throw new Error(response.error?.message || 'Failed to refresh deals');
            }
            
            const dbDeals = response.data || [];
            console.log(`Refreshed ${dbDeals.length} deals from database`);
            
            // Fetch loans and banks to determine correct lender
            let loansMap = {};
            let banksMap = {};
            
            try {
                const loansResponse = await API.getAllLoans();
                if (loansResponse.success) {
                    const allLoans = loansResponse.data || [];
                    allLoans.forEach(loan => {
                        if (loan.ProjectId) {
                            if (!loansMap[loan.ProjectId]) {
                                loansMap[loan.ProjectId] = [];
                            }
                            loansMap[loan.ProjectId].push(loan);
                        }
                    });
                }
            } catch (error) {
                console.warn('Failed to fetch loans:', error);
            }
            
            try {
                const banksResponse = await API.getAllBanks();
                if (banksResponse.success) {
                    const allBanks = banksResponse.data || [];
                    allBanks.forEach(bank => {
                        if (bank.BankId) {
                            banksMap[bank.BankId] = bank;
                        }
                    });
                }
            } catch (error) {
                console.warn('Failed to fetch banks:', error);
            }
            
            // Process and map the fresh data
            const refreshedDeals = [];
            dbDeals.forEach(dbDeal => {
                const deal = mapDealPipelineDataToDeal(dbDeal, loansMap, banksMap);
                if (deal) {
                    refreshedDeals.push(deal);
                }
            });
            
            // Update global allDeals with fresh data
            window.allDeals = refreshedDeals;
            console.log(`Updated allDeals with ${refreshedDeals.length} deals`);
            
        } catch (error) {
            console.warn('Failed to refresh data, using cached data:', error);
            // Continue with existing allDeals if refresh fails
        } finally {
            // Restore button state
            if (exportBtn) {
                exportBtn.disabled = false;
                exportBtn.textContent = originalText;
            }
        }

        // Filter deals by selected stages
        const dealsToExport = allDeals.filter(deal => {
            const stage = normalizeStage(deal.Stage || deal.stage);
            return selectedStages.includes(stage);
        }).sort((a, b) => {
            // Sort by start date
            const aDate = new Date(a['Start Date'] || a.startDate || 0);
            const bDate = new Date(b['Start Date'] || b.startDate || 0);
            return aDate - bDate;
        });

        if (dealsToExport.length === 0) {
            showToast('No deals found to export for the selected stages.', 'info');
            if (exportBtn) {
                exportBtn.disabled = false;
                exportBtn.textContent = originalText;
            }
            return;
        }

        // Group deals by stage (in the order they appear in overview)
        const stageOrder = [
            'Prospective',
            'Under Review',
            'Under Contract',
            'Under Construction',
            'Lease-Up',
            'Stabilized',
            'Liquidated',
            'Commercial Land - Listed',
            'Rejected',
            'Dead',
            'Other'
        ];
        
        const dealsByStage = {};
        dealsToExport.forEach(deal => {
            const stage = normalizeStage(deal.Stage || deal.stage);
            if (!dealsByStage[stage]) {
                dealsByStage[stage] = [];
            }
            dealsByStage[stage].push(deal);
        });
        
        // Sort each stage group by start date
        Object.keys(dealsByStage).forEach(stage => {
            dealsByStage[stage].sort((a, b) => {
                const aDate = new Date(a['Start Date'] || a.startDate || 0);
                const bDate = new Date(b['Start Date'] || b.startDate || 0);
                return aDate - bDate;
            });
        });

        // Define columns based on export type
        const allColumns = [
            'Project Name',
            'Stage',
            'City',
            'State',
            'Region',
            'Units',
            'Product Type',
            'Bank',
            'Start Date',
            'Due Diligence Date',
            'Closing Date',
            'Acreage',
            'Land Price',
            'Sq Ft Price',
            'Opportunity Zone',
            'Location'
        ];
        
        const investorExcludedColumns = ['Due Diligence Date', 'Land Price', 'Sq Ft Price', 'Opportunity Zone'];
        const columnsToInclude = exportType === 'investors' 
            ? allColumns.filter(col => !investorExcludedColumns.includes(col))
            : allColumns;

        // Helper function to create Google Maps URL
        const createLocationLink = (deal) => {
            const original = deal._original || {};
            const lat = deal.Latitude || original.Latitude;
            const lng = deal.Longitude || original.Longitude;
            
            if (lat && lng) {
                return `https://www.google.com/maps?q=${lat},${lng}`;
            }
            
            const address = deal.Location || '';
            if (address) {
                return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
            }
            
            const city = original.City || '';
            const state = original.State || '';
            if (city || state) {
                const location = `${city}, ${state}`.replace(/^,\s*|,\s*$/g, '').trim();
                if (location) {
                    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
                }
            }
            
            return null;
        };

        // Helper function to prepare data for a stage
        const prepareStageData = (stageDeals) => {
            return stageDeals.map(deal => {
                const original = deal._original || {};
                const startDate = deal['Start Date'] || original.StartDate || '';
                const closingDate = original.ClosingDate || '';
                const dueDiligenceDate = original.DueDiligenceDate || '';
                
                const locationLink = createLocationLink(deal);
                const locationText = deal.Location || `${original.City || ''}, ${original.State || ''}`.replace(/^,\s*|,\s*$/g, '');
                
                const row = {
                    'Project Name': deal.Name || original.ProjectName || '',
                    'Stage': deal.Stage || original.Stage || '',
                    'City': original.City || '',
                    'State': original.State || '',
                    'Region': original.Region || '',
                    'Units': deal['Unit Count'] || original.Units || original.UnitCount || '',
                    'Product Type': deal['Product Type'] || original.ProductType || '',
                    'Bank': deal.Bank || '',
                    'Start Date': startDate ? new Date(startDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '',
                    'Due Diligence Date': dueDiligenceDate ? new Date(dueDiligenceDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '',
                    'Closing Date': closingDate ? new Date(closingDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '',
                    'Acreage': original.Acreage || '',
                    'Land Price': original.LandPrice ? `$${parseFloat(original.LandPrice).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : '',
                    'Sq Ft Price': original.SqFtPrice ? `$${parseFloat(original.SqFtPrice).toFixed(2)}` : '',
                    'Opportunity Zone': original.OpportunityZone ? 'Yes' : 'No',
                    'Location': locationText,
                    '_locationLink': locationLink // Store link separately for Excel hyperlink
                };
                
                return row;
            });
        };
        
        // STOA Brand Colors (ExcelJS uses ARGB format)
        const brandColors = {
            primaryGreen: 'FF7E8A6B',      // #7e8a6b (dark green text)
            secondaryGreen: 'FFA6AD8A',     // #a6ad8a (light green background for header)
            secondaryGrey: 'FFEFEFF1',      // #efeff1 (light grey for banded rows)
            white: 'FFFFFFFF',             // #ffffff
            underContractBlue: 'FF2563EB', // #2563eb (Under Contract stage color)
            textPrimary: 'FF1F2937',       // #1f2937
            textSecondary: 'FF6B7280',      // #6b7280
            borderColor: 'FFE5E7EB',      // #e5e7eb
            darkGrey: 'FFD3D3D3'          // #d3d3d3 (darker grey for total row)
        };
        
        // Create workbook
        const workbook = new ExcelJS.Workbook();
        
        // Helper function to create a worksheet for a stage
        const createStageWorksheet = (stage, stageDeals) => {
            const excelData = prepareStageData(stageDeals);
            
            // Filter columns based on export type
            const filteredData = excelData.map(row => {
                const filteredRow = {};
                columnsToInclude.forEach(col => {
                    filteredRow[col] = row[col];
                });
                // Keep location link for hyperlink
                filteredRow._locationLink = row._locationLink;
                return filteredRow;
            });
            
            // Calculate totals
            const totalUnits = stageDeals.reduce((sum, deal) => {
                const units = parseInt(deal['Unit Count'] || deal._original?.Units || deal._original?.UnitCount || 0);
                return sum + (isNaN(units) ? 0 : units);
            }, 0);
            
            const totalLandPrice = stageDeals.reduce((sum, deal) => {
                const price = parseFloat(deal._original?.LandPrice || 0);
                return sum + (isNaN(price) ? 0 : price);
            }, 0);
            
            const totalAcreage = stageDeals.reduce((sum, deal) => {
                const acreage = parseFloat(deal._original?.Acreage || 0);
                return sum + (isNaN(acreage) ? 0 : acreage);
            }, 0);
            
            // Create total row
            const totalRow = {};
            columnsToInclude.forEach(col => {
                if (col === 'Project Name') {
                    totalRow[col] = 'TOTAL';
                } else if (col === 'Units') {
                    totalRow[col] = totalUnits;
                } else if (col === 'Acreage') {
                    totalRow[col] = totalAcreage > 0 ? totalAcreage.toFixed(2) : '';
                } else if (col === 'Land Price') {
                    totalRow[col] = totalLandPrice > 0 ? `$${totalLandPrice.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : '';
                } else {
                    totalRow[col] = '';
                }
            });
            
            const worksheet = workbook.addWorksheet(stage);
            const columnKeys = columnsToInclude;
            const numColumns = columnKeys.length;
            
            // Find location column index
            const locationColIndex = columnKeys.indexOf('Location');
            
            // Add title row (row 1)
            const titleRow = worksheet.addRow(['STOA Group - Deal Pipeline Report']);
            worksheet.mergeCells(1, 1, 1, numColumns);
            titleRow.getCell(1).font = { name: 'Arial', size: 24, bold: true, color: { argb: brandColors.white } };
            titleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: brandColors.primaryGreen } };
            titleRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
            titleRow.height = 30;
            
            // Add subtitle row (row 2)
            const subtitleRow = worksheet.addRow([`${stage} Deals`]);
            worksheet.mergeCells(2, 1, 2, numColumns);
            subtitleRow.getCell(1).font = { name: 'Arial', size: 18, bold: true, color: { argb: brandColors.primaryGreen } };
            subtitleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: brandColors.white } };
            subtitleRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
            subtitleRow.height = 22;
            
            // Add date row (row 3)
            const dateRow = worksheet.addRow([`Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`]);
            worksheet.mergeCells(3, 1, 3, numColumns);
            dateRow.getCell(1).font = { name: 'Arial', size: 11, color: { argb: brandColors.textSecondary } };
            dateRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: brandColors.white } };
            dateRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
            dateRow.height = 18;
            
            // Add blank row (row 4)
            worksheet.addRow([]);
            worksheet.getRow(4).height = 5;
            
            // Add header row (row 5)
            const headerRow = worksheet.addRow(columnKeys);
            headerRow.eachCell((cell, colNumber) => {
                cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF000000' } };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: brandColors.secondaryGreen } };
                cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
                cell.border = {
                    top: { style: 'thin', color: { argb: brandColors.borderColor } },
                    bottom: { style: 'thin', color: { argb: brandColors.borderColor } },
                    left: { style: 'thin', color: { argb: brandColors.borderColor } },
                    right: { style: 'thin', color: { argb: brandColors.borderColor } }
                };
            });
            headerRow.height = 25;
            
            // Add data rows
            filteredData.forEach((rowData, rowIndex) => {
                const rowValues = columnKeys.map(key => rowData[key]);
                const row = worksheet.addRow(rowValues);
                const isEvenRow = rowIndex % 2 === 0;
                const bgColor = isEvenRow ? brandColors.white : brandColors.secondaryGrey;
                
                row.eachCell((cell, colNumber) => {
                    cell.font = { name: 'Arial', size: 10, color: { argb: brandColors.textPrimary } };
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
                    cell.alignment = { 
                        horizontal: colNumber === 1 ? 'left' : 'center', 
                        vertical: 'middle',
                        wrapText: true
                    };
                    cell.border = {
                        top: { style: 'thin', color: { argb: brandColors.borderColor } },
                        bottom: { style: 'thin', color: { argb: brandColors.borderColor } },
                        left: { style: 'thin', color: { argb: brandColors.borderColor } },
                        right: { style: 'thin', color: { argb: brandColors.borderColor } }
                    };
                    
                    // Add hyperlink to Location column
                    if (colNumber === locationColIndex + 1 && rowData._locationLink) {
                        cell.value = { text: rowData['Location'], hyperlink: rowData._locationLink };
                        cell.font = { name: 'Arial', size: 10, color: { argb: 'FF0000FF' }, underline: true };
                    }
                });
                row.height = 20;
            });
            
            // Add total row
            const totalRowValues = columnKeys.map(key => totalRow[key]);
            const totalRowData = worksheet.addRow(totalRowValues);
            totalRowData.eachCell((cell) => {
                cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: brandColors.textPrimary } };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: brandColors.darkGrey } };
                cell.alignment = { 
                    horizontal: cell.col === 1 ? 'left' : 'center', 
                    vertical: 'middle',
                    wrapText: true
                };
                cell.border = {
                    top: { style: 'thin', color: { argb: brandColors.borderColor } },
                    bottom: { style: 'thin', color: { argb: brandColors.borderColor } },
                    left: { style: 'thin', color: { argb: brandColors.borderColor } },
                    right: { style: 'thin', color: { argb: brandColors.borderColor } }
                };
            });
            totalRowData.height = 20;
            
            // Set column widths
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
            
            columnKeys.forEach((key, index) => {
                let maxWidth = 0;
                const colNumber = index + 1;
                
                const headerCell = headerRow.getCell(colNumber);
                if (headerCell.value) {
                    maxWidth = Math.max(maxWidth, String(headerCell.value).length);
                }
                
                filteredData.forEach(rowData => {
                    const value = rowData[key];
                    if (value !== null && value !== undefined) {
                        maxWidth = Math.max(maxWidth, String(value).length);
                    }
                });
                
                const totalValue = totalRow[key];
                if (totalValue !== null && totalValue !== undefined) {
                    maxWidth = Math.max(maxWidth, String(totalValue).length);
                }
                
                const minWidth = minWidths[key] || 12;
                const finalWidth = Math.max(minWidth, Math.min(maxWidth + 2, 60));
                worksheet.getColumn(colNumber).width = finalWidth;
            });
            
            // Freeze header row
            worksheet.views = [{ state: 'frozen', ySplit: 5 }];
            
            return worksheet;
        };
        
        // Create worksheets for each selected stage (in order)
        const orderedStages = stageOrder.filter(s => selectedStages.includes(s) && dealsByStage[s]);
        orderedStages.forEach(stage => {
            createStageWorksheet(stage, dealsByStage[stage]);
        });
        
        // Generate filename with date
        const today = new Date();
        const dateStr = today.toISOString().split('T')[0];
        const exportTypeLabel = exportType === 'investors' ? 'Investors' : 'Internal';
        const filename = `STOA_Deal_Pipeline_${exportTypeLabel}_${dateStr}.xlsx`;

        // Write file using FileSaver
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        saveAs(blob, filename);

        // Show success message
        const stageCount = orderedStages.length;
        const stageLabel = stageCount === 1 ? 'stage' : 'stages';
        const message = `Successfully exported ${dealsToExport.length} deal(s) across ${stageCount} ${stageLabel} to ${filename}`;
        console.log(message);
        
        // Create a temporary toast notification
        const toast = document.createElement('div');
        toast.style.cssText = 'position: fixed; top: 20px; right: 20px; background: #10b981; color: white; padding: 12px 24px; border-radius: 4px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 10000; font-weight: 500;';
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
        
        // Restore button state
        if (exportBtn) {
            exportBtn.disabled = false;
            exportBtn.textContent = originalText;
        }

    } catch (error) {
        console.error('Error exporting pipeline:', error);
        showToast('Failed to export pipeline. Please try again or contact support. Error: ' + error.message, 'error');
        
        // Restore button state on error
        const exportBtn = document.getElementById('export-pipeline-btn');
        if (exportBtn) {
            exportBtn.disabled = false;
            exportBtn.textContent = 'Export Pipeline';
        }
    }
}

// Note: init() is defined in main.js (ES module) and called there — no bootstrap needed here.
