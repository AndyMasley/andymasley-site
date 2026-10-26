"""
The Central Arizona Project's 2015 deliveries, summed by the county and use they went to, for the water map's
imports (IMPORTS 'cap' in src/lib/water-map/core/transfers.js; WATER-MAP-METHODOLOGY.md, section 3).

The rows are CAP's Monthly Deliveries report for calendar year 2015 (printed 9/7/2016), the "Total" column in
acre-feet, as published at
https://library.cap-az.com/documents/departments/water-operations/monthly-delivery-report-2015.pdf
Each section's rows add up to its printed subtotal, and the subtotals to the printed total of 1,449,209 acre-feet;
the script checks both. Run it with plain Python 3; it prints each group's acre-feet and million gallons a day.
"""

# printed subtotals, by section
SUBTOTALS = {"M&I Subcontract": 499004, "M&I Excess": 125359, "M&I Temporary": 338, "Ag Pool": 318279,
             "Federal – On Reservation": 121626, "Federal – Off Reservation": 384603}
TOTAL = 1449209

# the report's rows: section -> [(customer, acre-feet)]
ROWS = {
    "M&I Subcontract": [
        ("Hohokam/CDR [Assign] Chandler @ GRUSP", 400), ("Hohokam/CDR [Assign] Chandler", 2472),
        ("Hohokam/CDR [Assign] Chandler @ SMRP", 80), ("Hohokam/CDR [Assign] Mesa", 4924),
        ("Hohokam/CDR [Assign] Phoenix @ AVRP", 0), ("Hohokam/CDR [Assign] Phoenix", 36144),
        ("Hohokam/CDR [Assign] Phoenix @ SRP", 0), ("Hohokam/CDR [Assign] Scottsdale", 3283),
        ("Avondale @ HMRP", 4916), ("Avondale", 500), ("AZ State Land", 16), ("AZWC, Casa Grande @ CAIDD", 1100),
        ("AZWC, Casa Grande @ MSIDD", 2500), ("AZWC, Casa Grande", 2390), ("AZWC, Coolidge @ CAIDD", 1400),
        ("AZWC, Superstition", 2974), ("CAGRD @ AFRP", 2839), ("CAGRD @ HMRP", 157), ("CAGRD @ MWD", 5000),
        ("Carefree WC", 509), ("Cave Creek", 1865), ("Chandler @ GRUSP", 1100), ("Chandler", 4977),
        ("Chandler @ SMRP", 0), ("Chandler @ SRP", 2482), ("Chaparral City WC", 5726), ("El Mirage @ HMRP", 508),
        ("Eloy @ CAIDD", 1600), ("Eloy", 383), ("EPCOR, AF @ MWD", 218), ("EPCOR, AF", 10875),
        ("EPCOR, PV @ MWD", 3231), ("EPCOR, SC @ MWD", 4189), ("EPCOR, SCW @ MWD", 2372), ("Florence @ CAIDD", 2048),
        ("FWID @ LSCRP", 2800), ("Gilbert @ GRUSP", 1265), ("Gilbert", 5502), ("Glendale @ HMRP", 900),
        ("Glendale", 9903), ("Glendale @ NAUSP", 780), ("Glendale @ SRP", 1500), ("Goodyear @ AFRP", 229),
        ("Marana @ LSCRP", 1528), ("Maricopa Cty P&R", 544), ("Mesa", 33193), ("Metro DWID @ AVRP", 5219),
        ("Metro DWID @ BKW", 1000), ("Metro DWID @ CMID", 4403), ("Metro DWID @ Kai-Red Rock", 1000),
        ("Oro Valley @ CAVSARP", 2200), ("Oro Valley @ Kai-Red Rock", 4000), ("Oro Valley @ LSCRP", 3605),
        ("Oro Valley @ PMRRP", 500), ("Peoria", 6116), ("Peoria @ SRP", 7500), ("Phoenix @ AVRP", 150),
        ("Phoenix @ GRUSP", 8580), ("Phoenix", 63443), ("Phoenix @ SAVSARP", 850), ("Phoenix @ SRP", 5000),
        ("Queen Creek", 495), ("Rio Verde Utilities", 385), ("Scottsdale @ GRUSP", 344), ("Scottsdale", 33964),
        ("Scottsdale @ SRP", 14000), ("Spanish Trail WC @ CMID", 2987), ("Spanish Trail WC @ PMRRP", 50),
        ("Surprise @ HMRP", 10249), ("Tempe @ GRUSP", 1034), ("Tempe", 3281), ("Tonto Hills DWID", 26),
        ("Tonto Hills DWID @ RWCD", 43), ("Tucson @ BKW", 10887), ("Tucson @ BKW-Milewide", 0),
        ("Tucson @ CAVSARP", 62005), ("Tucson", 136), ("Tucson @ PMRRP", 16500), ("Tucson @ SAVSARP", 55509),
        ("Vail WC @ Kai-Red Rock", 757), ("Vail WC @ SAVSARP", 1100), ("WUCFD, Apache Junction", 164),
        ("WUCFD, Apache Junction @ RWCD", 100), ("WUCFD, Apache Junction @ SRP", 100),
    ],
    "M&I Excess": [
        ("AWBA @ AFRP", 13628), ("AWBA @ AVRP", 1100), ("AWBA @ BKW", 500), ("AWBA @ CMID", 898),
        ("AWBA @ GRUSP", 3347), ("AWBA @ HIDD", 3700), ("AWBA @ HMRP", 13160), ("AWBA @ LSCRP", 1946),
        ("AWBA @ MSIDD", 4200), ("AWBA", 5000), ("AWBA @ PMRRP", 1300), ("AWBA @ QCID", 3598),
        ("AWBA @ SAVSARP", 14354), ("AWBA @ SMRP", 8609), ("CAGRD @ AFRP", 2200), ("CAGRD @ HMRP", 127),
        ("CAGRD @ LSCRP", 2816), ("CAGRD", 457), ("CAGRD @ NMIDD", 9000), ("CAGRD @ PMRRP", 1394),
        ("CAGRD @ QCID", 4000), ("CAGRD @ SMRP", 5444), ("CAGRD @ TID", 15000), ("USBR @ RWCD", 8433),
        ("SCAT [Lease] Gilbert @ SRP", 1148),
    ],
    "M&I Temporary": [
        ("Temporary Uses", 338),
    ],
    "Ag Pool": [
        ("BKW Farms", 409), ("CAIDD", 99558), ("HIDD", 36230), ("HVID", 37691), ("Kai Farms", 535),
        ("MSIDD", 111735), ("MWD", 1000), ("NMIDD", 7591), ("QCID", 8500), ("RWCD", 1253), ("SCIDD", 8613),
        ("SRP", 3800), ("TID", 1364),
    ],
    "Federal – On Reservation": [
        ("Ak-Chin", 71356), ("GRIC @ MAR", 3194), ("GRIC", 28794), ("Tohono O'odham - ST", 10615),
        ("Tohono O'odham - SX", 7667),
    ],
    "Federal – Off Reservation": [
        ("Ak-Chin [Lease] Del Webb @ MWD", 357), ("Ak-Chin [Lease] Del Webb", 4913),
        ("Ak-Chin [Lease] Del Webb @ West Maricopa", 3564), ("Ak-Chin [Lease] Pascua Yaqui", 644),
        ("Ak-Chin [Lease] Pascua Yaqui @ SAVSARP", 360), ("FMYN [Lease] Gilbert", 100),
        ("FMYN [Lease] Gilbert @ NMIDD", 6000), ("FMYN [Lease] Gilbert @ SMRP", 6833),
        ("FMYN [Lease] Gilbert @ SRP", 1000), ("FMYN [Lease] Phoenix", 4300), ("GRIC [Exchange] APS", 52),
        ("GRIC [Exchange] Chandler", 4605), ("GRIC [Exchange] Mesa", 7922),
        ("GRIC [Lease] Freeport-Morenci @ RWCD", 12000), ("GRIC [Lease] Goodyear @ AFRP", 3000),
        ("GRIC [Lease] Goodyear @ HMRP", 4000), ("GRIC [Lease] Peoria @ AFRP", 1129),
        ("GRIC [Lease] Peoria @ HMRP", 280), ("GRIC [Lease] Peoria", 5591), ("GRIC [Lease] Phoenix", 11000),
        ("GRIC [Lease] Phoenix @ SRP", 4000), ("GRIC [Lease] Scottsdale", 12000),
        ("GRIC [Lease] WUCFD, Apache Junction", 1000), ("Ak-Chin @ LSCRP", 2551), ("GRIC @ CAIDD", 18000),
        ("GRIC @ GRUSP", 6000), ("GRIC @ HIDD", 18079), ("GRIC @ MSIDD", 28000), ("GRIC @ MWD", 3000),
        ("GRIC @ NMIDD", 35000), ("GRIC @ RWCD", 27500), ("GRIC @ SMRP", 1217), ("GRIC @ SRP", 29222),
        ("Pascua Yaqui @ SAVSARP", 500), ("Tohono O'odham - SX @ ASARCO", 9056),
        ("Tohono O'odham - SX @ NMIDD", 25000), ("RWCD [Assign] Chandler @ SMRP", 972),
        ("RWCD [Assign] Gilbert", 1537), ("RWCD [Assign] Glendale", 682), ("RWCD [Assign] Mesa", 627),
        ("RWCD [Assign] Phoenix", 1136), ("RWCD [Assign] Scottsdale", 23), ("RWCD [Assign] Tempe", 23),
        ("SCAT [Exchange] Freeport-Miami", 9056), ("SCAT [Exchange] Freeport-Miami @ SRP", 4720),
        ("SCAT [Lease] Gilbert @ QCID", 11000), ("SCAT [Lease] Gilbert @ SRP", 7852),
        ("SCAT [Lease] Pascua Yaqui @ SAVSARP", 2000), ("SCAT [Lease] Scottsdale", 12500),
        ("SRPMIC [Lease] Chandler @ GRUSP", 200), ("SRPMIC [Lease] Chandler", 840),
        ("SRPMIC [Lease] Chandler @ SMRP", 289), ("SRPMIC [Lease] Chandler @ SRP", 1257),
        ("SRPMIC [Lease] Gilbert", 4088), ("SRPMIC [Lease] Glendale @ HMRP", 0),
        ("SRPMIC [Lease] Glendale @ MWD", 500), ("SRPMIC [Lease] Glendale", 1314), ("SRPMIC [Lease] Mesa", 1669),
        ("SRPMIC [Lease] Phoenix", 2023), ("SRPMIC [Lease] Phoenix @ SRP", 1000), ("SRPMIC [Lease] Scottsdale", 60),
        ("SRPMIC [Lease] Tempe", 60), ("Wellton-Mohawk [Assign] Chandler", 1744),
        ("Wellton-Mohawk [Assign] Chandler @ SMRP", 1559), ("Wellton-Mohawk [Assign] Chandler @ SRP", 761),
        ("Wellton-Mohawk [Assign] Gilbert", 6424), ("Wellton-Mohawk [Assign] Glendale @ MWD", 500),
        ("Wellton-Mohawk [Assign] Glendale", 2350), ("Wellton-Mohawk [Assign] Mesa", 2622),
        ("Wellton-Mohawk [Assign] Phoenix", 4750), ("Wellton-Mohawk [Assign] Phoenix @ SRP", 0),
        ("Wellton-Mohawk [Assign] Scottsdale", 95), ("Wellton-Mohawk [Assign] Tempe", 95),
        ("Yavapai-Prescott [Assign] Scottsdale", 500),
    ],
}

# where each delivery went: county and use, and after the colon the route in transfers.js it is drawn along (the
# acre-feet are the weights in the map's `at` lists). Deliveries
# "@" an irrigation district are water stored there, which the district's farms use in place of pumping groundwater.
# Left out: recharge projects (the water comes back up as groundwater), the Salt River Project, the Gila River Indian
# Community and the New Magma district (each in both Maricopa and Pinal), the Harquahala Valley and Queen Creek
# districts and BKW Farms (county not confirmed), mines, the replenishment and banking authorities' own accounts, and
# a few small deliveries.
GROUPS = {
    "Maricopa, public supply": [
        "Hohokam/CDR [Assign] Chandler", "Hohokam/CDR [Assign] Mesa", "Hohokam/CDR [Assign] Phoenix",
        "Hohokam/CDR [Assign] Scottsdale", "Avondale", "Carefree WC", "Cave Creek", "Chandler", "Chaparral City WC",
        "EPCOR, AF", "Gilbert", "Glendale", "Mesa", "Peoria", "Phoenix", "Queen Creek", "Rio Verde Utilities",
        "Scottsdale", "Tempe", "Tonto Hills DWID", "Ak-Chin [Lease] Del Webb", "FMYN [Lease] Gilbert",
        "FMYN [Lease] Phoenix", "GRIC [Exchange] Chandler", "GRIC [Exchange] Mesa", "GRIC [Lease] Peoria",
        "GRIC [Lease] Phoenix", "GRIC [Lease] Scottsdale", "RWCD [Assign] Gilbert", "RWCD [Assign] Glendale",
        "RWCD [Assign] Mesa", "RWCD [Assign] Phoenix", "RWCD [Assign] Scottsdale", "RWCD [Assign] Tempe",
        "SCAT [Lease] Scottsdale", "SRPMIC [Lease] Chandler", "SRPMIC [Lease] Gilbert", "SRPMIC [Lease] Glendale",
        "SRPMIC [Lease] Mesa", "SRPMIC [Lease] Phoenix", "SRPMIC [Lease] Scottsdale", "SRPMIC [Lease] Tempe",
        "Wellton-Mohawk [Assign] Chandler", "Wellton-Mohawk [Assign] Gilbert", "Wellton-Mohawk [Assign] Glendale",
        "Wellton-Mohawk [Assign] Mesa", "Wellton-Mohawk [Assign] Phoenix", "Wellton-Mohawk [Assign] Scottsdale",
        "Wellton-Mohawk [Assign] Tempe", "Yavapai-Prescott [Assign] Scottsdale",
    ],
    "Pinal, public supply": [
        "AZWC, Casa Grande", "AZWC, Superstition", "Eloy", "WUCFD, Apache Junction",
        "GRIC [Lease] WUCFD, Apache Junction",
    ],
    "Maricopa, crops: gilbert": [
        "RWCD", "Tonto Hills DWID @ RWCD", "WUCFD, Apache Junction @ RWCD", "USBR @ RWCD",
        "GRIC [Lease] Freeport-Morenci @ RWCD", "GRIC @ RWCD",
    ],
    "Maricopa, crops: waddell": [
        "MWD", "CAGRD @ MWD", "EPCOR, AF @ MWD", "EPCOR, PV @ MWD", "EPCOR, SC @ MWD", "EPCOR, SCW @ MWD",
        "Ak-Chin [Lease] Del Webb @ MWD", "GRIC @ MWD", "SRPMIC [Lease] Glendale @ MWD",
        "Wellton-Mohawk [Assign] Glendale @ MWD",
    ],
    "Maricopa, crops: tonopah": [
        "TID", "CAGRD @ TID",
    ],
    "Pinal, crops: eloy": [
        "CAIDD", "Kai Farms", "AZWC, Casa Grande @ CAIDD", "AZWC, Coolidge @ CAIDD", "Eloy @ CAIDD", "Florence @ CAIDD", "GRIC @ CAIDD", "Metro DWID @ Kai-Red Rock", "Oro Valley @ Kai-Red Rock", "Vail WC @ Kai-Red Rock",
    ],
    "Pinal, crops: coolidge": [
        "HIDD", "SCIDD", "AWBA @ HIDD", "GRIC @ HIDD",
    ],
    "Pinal, crops: stanfield": [
        "MSIDD", "Ak-Chin", "AZWC, Casa Grande @ MSIDD", "AWBA @ MSIDD", "GRIC @ MSIDD",
    ],
    "Pima, crops: marana": [
        "Metro DWID @ CMID", "Spanish Trail WC @ CMID", "AWBA @ CMID",
    ],
    "Pima, crops: sanXavier": [
        "Tohono O'odham - SX",
    ],
    "Pima, crops: avra": [
        "Tohono O'odham - ST",
    ],
}

MGD = 325851 / 365 / 1e6   # an acre-foot a year, in million gallons a day


def main():
    af, seen, total = {}, {}, 0
    for sec, rows in ROWS.items():
        s = sum(a for _, a in rows)
        assert s == SUBTOTALS[sec], (sec, s, SUBTOTALS[sec])
        total += s
        for name, a in rows:
            seen[name] = seen.get(name, 0) + 1
            af[name] = a
    assert total == TOTAL, total
    used, placed = set(), 0
    for g, names in GROUPS.items():
        s = 0
        for n in names:
            # (a few customers appear in two sections; none of those is in a group)
            assert n in af and seen[n] == 1 and n not in used, n
            used.add(n)
            s += af[n]
        placed += s
        print(f"{g:28s} {s:9,d} acre-feet {s * MGD:8.2f} Mgal/d")
    print(f"placed {placed:,d} of {TOTAL:,d} acre-feet ({placed * MGD:.1f} Mgal/d)")


if __name__ == "__main__":
    main()
