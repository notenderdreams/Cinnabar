import React from 'react';

type ElementProps<T extends keyof React.JSX.IntrinsicElements> = React.ComponentPropsWithoutRef<T>;

export const DataTable = React.forwardRef<HTMLTableElement, ElementProps<'table'>>(
  ({ className = '', ...props }, ref) => (
    <div className="data-table-shell">
      <table ref={ref} className={`data-table ${className}`} {...props} />
    </div>
  ),
);
DataTable.displayName = 'DataTable';

export const DataTableHeader = React.forwardRef<HTMLTableSectionElement, ElementProps<'thead'>>(
  ({ className = '', ...props }, ref) => (
    <thead ref={ref} className={`data-table-header ${className}`} {...props} />
  ),
);
DataTableHeader.displayName = 'DataTableHeader';

export const DataTableBody = React.forwardRef<HTMLTableSectionElement, ElementProps<'tbody'>>(
  ({ className = '', ...props }, ref) => (
    <tbody ref={ref} className={`data-table-body ${className}`} {...props} />
  ),
);
DataTableBody.displayName = 'DataTableBody';

export const DataTableRow = React.forwardRef<HTMLTableRowElement, ElementProps<'tr'>>(
  ({ className = '', ...props }, ref) => (
    <tr ref={ref} className={`data-table-row ${className}`} {...props} />
  ),
);
DataTableRow.displayName = 'DataTableRow';

export const DataTableHead = React.forwardRef<HTMLTableCellElement, ElementProps<'th'>>(
  ({ className = '', ...props }, ref) => (
    <th ref={ref} className={`data-table-head ${className}`} {...props} />
  ),
);
DataTableHead.displayName = 'DataTableHead';

export const DataTableCell = React.forwardRef<HTMLTableCellElement, ElementProps<'td'>>(
  ({ className = '', ...props }, ref) => (
    <td ref={ref} className={`data-table-cell ${className}`} {...props} />
  ),
);
DataTableCell.displayName = 'DataTableCell';
