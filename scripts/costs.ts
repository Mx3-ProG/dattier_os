import { readFile } from "node:fs/promises";
const model = JSON.parse(await readFile("docs/platform/COSTS.json", "utf8"));
console.log(
  "Hypothèses illustratives ; aucun tarif fournisseur ni prix commercial validé.",
);
console.table(
  model.scenarios.map(
    (s: { restaurants: number; fixedMonthlyInfrastructure: number }) => {
      const support =
          ((s.restaurants * model.supportMinutesPerRestaurant) / 60) *
          model.supportHourlyCost,
        total =
          s.fixedMonthlyInfrastructure +
          s.restaurants * model.variableInfrastructurePerRestaurant +
          support;
      return {
        restaurants: s.restaurants,
        monthlyCost: Math.round(total),
        costPerRestaurant: (total / s.restaurants).toFixed(2),
        priceExTax: model.monthlyPriceExTax,
        contributionBeforeExclusions: (
          model.monthlyPriceExTax -
          total / s.restaurants
        ).toFixed(2),
      };
    },
  ),
);
