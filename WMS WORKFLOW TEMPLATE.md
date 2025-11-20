WMS WORKFLOW TEMPLATE

Delivery Notes:

Task description: When in the Delivery Note mode, use AI to Scan and Recognize the contents of delivery notes with Strict accuracy and clear division of Article number, Purchase number, Order number reference*, and Product Name/description in a standardized format, displayed equally in the system despite different delivery note layouts.
If there are multiple rows/orders with the same article, the system will recognize this and differ between the different order numbers. *The order numbers references are often displayed as Godsmärkning/Märkning/Referens on the delivery notes, 5-8 characters. For each article checked on the delivery note, a POST request is made through the Sellus API to the corresponding order which will be updated with the received articles. If the system fails to gather any order data for an article from Sellus, notify the user. If the received amount of any article were to differ from the delivery note, an option to change the received amount should be available for the user to adjust. All this is done according to the workflow template with Sellus, i.e. all articles that are checked on the delivery note are posted to the respective purchase order where it is updated according to the delivered quantity. Internally, the system will display each order with received articles as: Received, Not received or Partially received*, if for example only 1 of 2 counts of an article were delivered. (*Mottagen, Ej mottagen, Delvis mottagen)
Important: The stock balance in the system should only be updated when in Sellus is changed, if synchronization fails and there is a diff, the user should be warned about it in the system. Order and item data is collected continuously via Sellus data when the products are scanned. 


WORKFLOW TEMPLATE- Delivery notes:


    1. Get order id for the product using the order number reference* displayed on the delivery note:
       GET/orders/{id}
       if null:
       Get order id using the article number:
       GET/items/by-item-number/{itemNumber}
       Copy the item "id"
       Get orders with item id:
       GET/items/{item-id}/orders?branchId=5
       Display active orders
       if null:
       Get order number from invoice:
       GET/documents/orders/{orderId}
       If null, notify user 
       Copy order id
       Then,
       GET/orders/{id}
       Display active orders- User chooses order and enters article count.
    2. Add all updated rows for the corresponding order in the WMS- system under “Ordrar”: Product names, item numbers, quantity, customer records and update delivered articles: 1 / 2 , 3 / 4 etc- Mark as complete when all rows with item numbers are fully deliverd- all rows with item numbers starting with “645/“0645” should always be autofilled as in existing stock*, unless manually changed. 
    3. Get purchase order with the order number REFERENCE(Godsmärkning/Märkning/Referens)
       GET/purchase-orders?filter=%22%20{reference}%20%22
       If null, notify user
       Copy body, then update the purchase order:
    4. POST/purchase-orders/{id}   
       Paste the copied purchase order and change the following values for the related article:
       "shippedQuantity": {previous number+recieved number on the slip/manually entered}
       "stockQuantity": {previous number+recieved number on the slip/manually entered}
       "totalStockQuantity": {previous number+recieved number on the slip/manually entered} 

IMPORTANT!!
Use the numbers from the original purchase order, then ADD the delivered amount from the shipment and enter the CALCULATED number (for example, NOT: 1+1, but: 2)
On Elon Delivery notes, the single “Godsmärkning” at the top only displays a telephone number, the actual order number references are the 5-8 character numbers displayed under “Godsmärkning rad”. 



Product/Article Scanning:

Note: all rules and routines for Delivery notes are applied to Article scanning unless explicitly stated otherwise!  
Task description: When in Scan mode, use AI to Scan photos of product labels to Recognize Article numbers, Product names and eventual Order number reference with Strict accuracy. Then, use these values to search for related orders using the Sellus API. This will then be displayed in a standardized format, displaying the correct article number and product name, with a drop down list of orders containing this article, sorted by latest first. If a product label contains an order number reference, the referred order is displayed first as the suggested order, with the option to scroll down to choose another order. When choosing an order, an option to mark the article as received for that order will appear, with the option to enter the received amount if the order contains more than 1 unit of that article. 

Use the same workflow template as for delivery notes:

WORKFLOW TEMPLATE- Label Scanning:

    1. Get order id for the product using the order number reference* displayed on the product label:
       GET/orders/{id}
       if null:
       Get order id using the article number:
       GET/items/by-item-number/{itemNumber}
       Copy the item "id"
       Get orders with item id:
       GET/items/{item-id}/orders?branchId=5
       Display active orders
       if null:
       Get order number from invoice:
       GET/documents/orders/{orderId}
       If null, notify user 
       Copy order id
       Then,
       GET/orders/{id}
       Display active orders- User chooses order and enters article count.
    2. Add all updated rows for the corresponding order in the WMS- system under “Ordrar”: Product names, item numbers, quantity, customer records and update delivered articles: 1 / 2 , 3 / 4 etc- Mark as complete when all rows with item numbers are fully deliverd- all rows with item numbers starting with “645/“0645” should always be autofilled as in existing stock*, unless manually changed. 
    3. Get purchase order with the order number REFERENCE(Godsmärkning/Märkning/Referens)
       GET/purchase-orders?filter=%22%20{reference}%20%22
       If null, notify user
       Copy body, then update the purchase order:
    4. POST/purchase-orders/{id}   
       Paste the copied purchase order and change the following values for the related article:
       "shippedQuantity": {previous number+recieved number on the slip/manually entered}
       "stockQuantity": {previous number+recieved number on the slip/manually entered}
       "totalStockQuantity": {previous number+recieved number on the slip/manually entered}

IMPORTANT!!
Use the numbers from the original purchase order, then ADD the delivered amount from the shipment and enter the CALCULATED number (for example, NOT: 1+1, but: 2)


Functionality: 
*Add function for marking an article in an order as in existent stock. (Befintligt lager)
The tab “Följesedlar” should contain a list view of all digital delivery notes, with day and date, sorted by latest received. Make all delivery notes clickable to display the number of articles and picking status, and save all delivery notes for 1 year with a backup that can be imported back if they were to be lost. Make each article in the delivery notes clickable to display the associated order and the delivery status for other articles on it. Make this function available to all users. If the delivered amount differs from the delivery note, mark that article with an exclamation warning sign in the list stating: ”Alla produkter ej mottagna”, also make a reference point to the digital delivery note from the article in the affected order.

