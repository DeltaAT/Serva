# Activity Diagram 

## (Flowchart)

This shouuuld be an Activity Diagramm but a Flowchart is just easier and the same.

### Waiter Ordering Workflow

````mermaid
flowchart
    START((Start)) --> SELECT_TABLE(Waiter selects Table
    either through QR Code or
    selecting the table)
    SELECT_TABLE --> SELECT_FOOD(Waiter selects the food and
    drinks from the Categories)
    SELECT_FOOD --> ORDER_EXTRA(Waiter can also add an
    Extra to a specific Order)
    ORDER_EXTRA --> PAYMENT(Waiter tells customer the price
    the bill can also be split)
    PAYMENT --> PROCESSED_ORDER(Order is being sent to the backend
    and printed on the printers)
    PROCESSED_ORDER --> SELECT_TABLE

````