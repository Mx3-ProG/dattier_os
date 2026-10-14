import type { Transaction } from "@electric-sql/pglite";
import {
  createOrder,
  changeItem,
  orderSchema,
  reserve,
} from "../../features/orders/service";
import { rows } from "./db";
export async function seed(db: Transaction) {
  await db.query(
    "INSERT INTO restaurants VALUES ('bernay','Le Dattier Hefsi','29 Rue du Général Leclerc, 27300 Bernay','02 32 46 12 11',150000),('atelier','L’Atelier — établissement fictif','Établissement de démonstration','',90000)",
  );
  const people = [
    ["slimane", "Slimane", "SUPER_ADMIN"],
    ["nadia", "Nadia", "OWNER"],
    ["lina", "Lina", "MANAGER"],
    ["sarah", "Sarah", "WAITER"],
    ["karim", "Karim", "CHEF"],
    ["youssef", "Youssef", "BARTENDER"],
    ["amine", "Amine", "STOCK_MANAGER"],
    ["ines", "Inès", "PURCHASING"],
    ["leila", "Leïla", "ACCOUNTANT"],
  ];
  for (const [id, name, role] of people) {
    await db.query("INSERT INTO profiles VALUES ($1,$2,$3)", [id, name, role]);
    for (const r of role === "OWNER" || role === "SUPER_ADMIN"
      ? ["bernay", "atelier"]
      : ["bernay"])
      await db.query("INSERT INTO memberships VALUES ($1,$2,$3)", [
        id,
        r,
        role,
      ]);
  }
  const ingredients: [string, string, string, number, number, number][] = [
    ["semoule", "Semoule", "g", 40000, 2000, 0.0018],
    ["poulet", "Poulet", "g", 40000, 2500, 0.008],
    ["merguez", "Merguez", "unit", 400, 25, 0.7],
    ["pois", "Pois chiches", "g", 40000, 2000, 0.002],
    ["carottes", "Carottes", "g", 40000, 2000, 0.0015],
    ["agneau", "Agneau", "g", 6000, 1500, 0.015],
    ["legumes", "Légumes de saison", "g", 40000, 2000, 0.003],
    ["the", "Thé vert", "g", 500, 100, 0.03],
    ["menthe", "Menthe fraîche", "g", 600, 150, 0.015],
    ["sucre", "Sucre", "g", 4000, 500, 0.0015],
    ["dessert", "Portion dessert", "unit", 60, 10, 2.1],
    ["boisson", "Boisson en bouteille", "unit", 80, 15, 1.2],
    ["brick", "Feuille de brick", "unit", 40, 10, 0.3],
  ];
  for (const r of ["bernay", "atelier"]) {
    for (let i = 1; i <= 12; i++)
      await db.query(
        "INSERT INTO dining_tables(id,restaurant_id,number,capacity) VALUES($1,$2,$3,$4)",
        [`${r}-t${i}`, r, i, i % 3 === 0 ? 6 : 4],
      );
    for (const [id, name, unit, qty, threshold, cost] of ingredients) {
      await db.query("INSERT INTO ingredients VALUES($1,$2,$3,$4,$5,$6)", [
        `${r}-${id}`,
        r,
        name,
        unit,
        threshold,
        cost,
      ]);
      await db.query(
        "INSERT INTO stock_lots(id,ingredient_id,quantity,expires_on) VALUES($1,$2,$3,CURRENT_DATE+14)",
        [`${r}-${id}-lot`, `${r}-${id}`, r === "bernay" ? qty : qty / 2],
      );
      await db.query(
        "INSERT INTO stock_movements VALUES($1,$2,$3,$4,'receipt','Stock initial fictif','amine',null,now())",
        [
          `${r}-${id}-init`,
          r,
          `${r}-${id}-lot`,
          r === "bernay" ? qty : qty / 2,
        ],
      );
    }
    await db.query(
      "INSERT INTO stock_lots(id,ingredient_id,quantity,expires_on) VALUES($1,$2,1000,CURRENT_DATE-1)",
      [`${r}-expired`, `${r}-legumes`],
    );
    const categories: Record<string, string[]> = {
      Entrées: [
        "Brick à l’œuf",
        "Salade méchouia",
        "Olives et carottes",
        "Pois chiches et raisins secs",
        "Semoule berbère",
        "Chorba",
        "Houmous maison",
        "Salade tunisienne",
      ],
      Plats: [
        "Couscous royal",
        "Tajine poulet citron et olives vertes",
        "Couscous poulet",
        "Poulet merguez",
        "Côtes d’agneau",
        "Couscous légumes",
        "Couscous agneau",
        "Tajine légumes",
        "Grillade de poulet",
        "Paella sur commande",
        "Merguez grillées",
        "Tajine kefta",
      ],
      Desserts: [
        "Nougat glacé sur coulis de fruits rouges",
        "Noix de coco givrée",
        "Baklava",
        "Makroud",
        "Salade d’oranges",
        "Dattes farcies",
      ],
      Boissons: [
        "Thé à la menthe",
        "Café",
        "Eau plate",
        "Eau pétillante",
        "Citronnade",
        "Jus d’orange",
        "Jus de pomme",
        "Cola",
        "Limonade",
        "Infusion",
        "Thé au jasmin",
        "Sirop à l’eau",
      ],
    };
    for (const [category, names] of Object.entries(categories))
      for (const [i, name] of names.entries()) {
        const id = `${r}-${category}-${i}`;
        const price =
          category === "Plats"
            ? 2200 + i * 100
            : category === "Entrées"
              ? 600 + i * 50
              : category === "Desserts"
                ? 700 + i * 50
                : 350 + i * 25;
        await db.query(
          "INSERT INTO menu_items(id,restaurant_id,name,category,price,station,description) VALUES($1,$2,$3,$4,$5,$6,$7)",
          [
            id,
            r,
            name,
            category,
            price,
            category === "Boissons" ? "bar" : "kitchen",
            "Recette et prix de démonstration. Composition et allergènes à valider.",
          ],
        );
        const recipe: [string, number][] =
          category === "Plats"
            ? i === 0
              ? [
                  ["semoule", 200],
                  ["poulet", 150],
                  ["merguez", 2],
                  ["pois", 100],
                  ["carottes", 100],
                ]
              : [
                  ["semoule", 180],
                  [
                    i === 4 || i === 6
                      ? "agneau"
                      : i === 5 || i === 7
                        ? "legumes"
                        : "poulet",
                    180,
                  ],
                  ["legumes", 120],
                ]
            : category === "Entrées"
              ? [
                  ["legumes", 120],
                  ["pois", 60],
                ]
              : category === "Desserts"
                ? [["dessert", 1]]
                : i === 0
                  ? [
                      ["the", 4],
                      ["menthe", 8],
                      ["sucre", 10],
                    ]
                  : [["boisson", 1]];
        for (const [ing, quantity] of recipe)
          await db.query(
            "INSERT INTO recipe_ingredients VALUES($1,$2,$3) ON CONFLICT(menu_id,ingredient_id) DO UPDATE SET quantity=recipe_ingredients.quantity+EXCLUDED.quantity",
            [id, `${r}-${ing}`, quantity],
          );
      }
    for (const [id, name, contact] of [
      ["atlas", "Les Jardins de l’Atlas", "contact@atlas.example"],
      ["soleil", "Marché du Soleil", "bonjour@soleil.example"],
      ["orient", "Saveurs d’Orient", "livraison@orient.example"],
    ])
      await db.query("INSERT INTO suppliers VALUES($1,$2,$3,$4,2)", [
        `${r}-${id}`,
        r,
        name,
        contact,
      ]);
    await db.query(
      "INSERT INTO purchase_orders(id,restaurant_id,supplier_id,ingredient_id,quantity,due_on) VALUES($1,$2,$3,$4,20000,CURRENT_DATE+1)",
      [`${r}-purchase`, r, `${r}-atlas`, `${r}-semoule`],
    );
    for (let day = 0; day < 14; day++) {
      const oid = `${r}-history-${day}`,
        qty = 3 + (day % 5),
        price = 2200;
      await db.query(
        "INSERT INTO orders(id,restaurant_id,channel,status,created_by,created_at,idempotency_key) VALUES($1,$2,'takeaway','paid','sarah',now()-($3||' days')::interval,$1)",
        [oid, r, day],
      );
      await db.query(
        "INSERT INTO order_items(id,order_id,menu_id,name,price,quantity,station,status,material_cost) VALUES($1,$2,$3,'Couscous royal',2200,$4,'kitchen','served',3.31)",
        [`${oid}-item`, oid, `${r}-Plats-0`, qty],
      );
      await reserve(db, r, `${oid}-item`, `${r}-Plats-0`, qty, "sarah");
      const reservations = await rows<{
        id: string;
        lot_id: string;
        quantity: number;
      }>(
        db,
        "SELECT *,quantity::float FROM stock_reservations WHERE item_id=$1",
        [`${oid}-item`],
      );
      for (const reservation of reservations) {
        await db.query(
          "UPDATE stock_lots SET quantity=quantity-$2,reserved=reserved-$2 WHERE id=$1",
          [reservation.lot_id, reservation.quantity],
        );
        await db.query(
          "UPDATE stock_reservations SET status='consumed' WHERE id=$1",
          [reservation.id],
        );
        await db.query(
          "INSERT INTO stock_movements VALUES($1,$2,$3,$4,'consumption','Préparation historique fictive','karim',$5,now()-($6||' days')::interval)",
          [
            `${reservation.id}-consumed`,
            r,
            reservation.lot_id,
            -reservation.quantity,
            `${oid}-item`,
            day,
          ],
        );
      }
      await db.query(
        "INSERT INTO payment_declarations(id,order_id,amount,method,actor,created_at) VALUES($1,$2,$3,'card','sarah',now()-($4||' days')::interval)",
        [`${oid}-pay`, oid, qty * price, day],
      );
    }
    for (let i = 0; i < 5; i++)
      await db.query(
        "INSERT INTO reservations(id,restaurant_id,name,contact,guests,starts_at,ends_at,note) VALUES($1,$2,$3,'demo@example.test',$4,CURRENT_DATE+($5||' days')::interval+interval '18 hours',CURRENT_DATE+($5||' days')::interval+interval '20 hours','Réservation fictive')",
        [
          `${r}-res-${i}`,
          r,
          [
            "Famille Martin",
            "Camille Dubois",
            "Alex Bernard",
            "Sam Moreau",
            "Lou Petit",
          ][i],
          2 + (i % 4),
          i % 3,
        ],
      );
    await db.query(
      "INSERT INTO customers VALUES($1,$2,'Camille — fictif','camille@example.test',true,40)",
      [`${r}-customer`, r],
    );
    await db.query(
      "INSERT INTO notifications VALUES($1,$2,'Bienvenue. Les données de cette installation sont fictives.',now())",
      [`${r}-welcome`, r],
    );
    await db.query(
      "INSERT INTO audit_logs VALUES($1,$2,null,'Initialisation du restaurant de démonstration',null,now())",
      [`${r}-seed`, r],
    );
  }
  const waiter = { id: "sarah", name: "Sarah", role: "WAITER" as const };
  for (const n of [2, 4, 6]) {
    const oid = await createOrder(
      db,
      orderSchema.parse({
        restaurant: "bernay",
        table: `bernay-t${n}`,
        key: `seed-order-${n}`,
        items: [
          { menu: "bernay-Plats-0", quantity: 2 },
          { menu: "bernay-Boissons-0", quantity: 2 },
        ],
      }),
      waiter,
    );
    const items = await rows<{ id: string; station: string }>(
      db,
      "SELECT * FROM order_items WHERE order_id=$1",
      [oid],
    );
    for (const item of items) {
      if (n === 4)
        await changeItem(db, "bernay", item.id, "preparing", {
          id: item.station === "bar" ? "youssef" : "karim",
          name: "Démo",
          role: item.station === "bar" ? "BARTENDER" : "CHEF",
        });
      if (n === 6) await changeItem(db, "bernay", item.id, "cancelled", waiter);
    }
    if (n === 6) {
      await db.query("UPDATE orders SET status='cancelled' WHERE id=$1", [oid]);
      await db.query(
        "UPDATE table_sessions SET closed_at=now() WHERE table_id='bernay-t6'",
      );
      await db.query(
        "UPDATE dining_tables SET status='free' WHERE id='bernay-t6'",
      );
    }
  }
  for (const id of ["sarah", "karim", "youssef", "amine"])
    await db.query(
      "INSERT INTO shifts VALUES($1,'bernay',$2,CURRENT_DATE+interval '16 hours',CURRENT_DATE+interval '22 hours')",
      [`shift-${id}`, id],
    );
}
