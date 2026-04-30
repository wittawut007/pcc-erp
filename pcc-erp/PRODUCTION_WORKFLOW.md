# Production Workflow Sequence Diagram

This document contains the sequence diagram syntax for the Production Workflow, formatted for rendering in Eraser.

```eraser
title Production Workflow
autoNumber nested

// Actors
Planner [icon: user, color: blue]
Desktop [icon: monitor, color: blue]
System [icon: server]
Material Staff [icon: package, color: green]
Worker [icon: hard-hat, color: orange]
Mobile [icon: smartphone, color: orange]
Concrete Staff [icon: tool, color: purple]
QC [icon: clipboard-check, color: red]
Warehouse Staff [icon: archive, color: yellow]

// Step 1-2: Planning phase
Planner <> Desktop: Login and create production plan
Desktop > System: Save material summary
System > Material Staff: Send material requisition

// Step 3: Material dispensing
Material Staff > System: View requisition on dashboard
Material Staff > System: Confirm material dispensing
System > System: Deduct raw material stock

// Step 4-6: Worker production
Worker > Mobile: Login and confirm steel placement
Worker > Mobile: Request concrete order
Mobile > System: Update status
System > Concrete Staff: Display concrete queue on dashboard

// Step 7: Concrete mixing
Concrete Staff > System: Mix and confirm concrete delivery

// Step 8-9: Quality control
QC > Mobile: Inspect and confirm concrete pouring
QC > Mobile: Inspect mold removal
alt [label: inspection result] {
  QC > System: Record good items count
}
else [label: defects found] {
  QC > System: Record defects with reasons
}

// Step 10-11: Warehouse receiving
System > Warehouse Staff: Send approved items to inventory screen
Warehouse Staff > System: Verify count and confirm receipt to finished goods
```
