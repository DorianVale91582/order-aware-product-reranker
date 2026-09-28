export {};

const response = await fetch("http://localhost:8080/search/rerank", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    query: "waterproof trail shoes arriving before Friday",
    topK: 2,
    candidates: [
      {
        id: "shoe-forest-42",
        title: "Forest Ridge waterproof trail shoe",
        description: "Grippy waterproof trail runner in size 42",
        checkout: "available",
        fulfillment: "ready",
        receipt: "not_issued",
        customerUpdate: "Warehouse pickup is ready for next-day dispatch",
      },
      {
        id: "shoe-road-42",
        title: "City road shoe",
        description: "Light road running shoe in size 42",
        checkout: "reserved",
        fulfillment: "processing",
        receipt: "issued",
        customerUpdate: "Order is being packed for standard delivery",
      },
      {
        id: "shoe-peak-42",
        title: "Peak waterproof trail shoe",
        description: "Technical trail shoe from a cancelled checkout",
        checkout: "cancelled",
        fulfillment: "ready",
        receipt: "not_issued",
        customerUpdate: "Checkout was cancelled by the customer",
      }
    ]
  }),
});

console.log(JSON.stringify(await response.json(), null, 2));
