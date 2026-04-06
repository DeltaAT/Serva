# ER Diagram

````mermaid
erDiagram
    Configurations {
        string name
        string value
    }
    
    Users {
        string username
        boolean isLocked
    }
    
    MenuCategories {
        string name
        string description
        boolean isLocked
        int weight
        int printer FK
        int orderDisplay FK
    }
    
    MenuItems {
        string name
        string description
        int weight
        float price
        boolean isLocked
        int menuCategory_id FK
    }
    
    Tables {
        string name
        int weight
        boolean isLocked
    }
    
    StockItems {
        string name
        int quantity
    }
    
    StockItemMenuItem {
        int stockItem_id FK
        int menuItem_id FK
        int quantityRequired
    }
    
    Orders {
        datetime timestamp
        int table_id FK
        int user_id FK
    }
    
    OrderItems {
        int order_id FK
        int menuItem_id FK
        int quantity
        string specialRequests
    }
    
    Printers {
        string name
        string ipAddress
        string connectionDetails
    }
    
    OrderDisplays {
        string name
        string ipAddress
        string connectionDetails
    }
    
    Printers o|--o{ MenuCategories : "prints"
    OrderDisplays o|--o{ MenuCategories : "displays"
    MenuCategories ||--o{ MenuItems : "contains"
    Tables ||--o{ Orders : "has"
    Users ||--o{ Orders : "places"
    Orders ||--o{ OrderItems : "includes"
    MenuItems ||--o{ OrderItems : "ordered in"
    StockItems ||--o{ StockItemMenuItem : "used in"
    MenuItems ||--o{ StockItemMenuItem : "requires"
    
    

````