trades = [('AAPL',150.00),('GOOG',2800.00),('AAPL',151.25),('MSFT',300.00),('GOOG',2795.00)]

by_ticker  = {}
for ticker, price in trades:
    if ticker not in by_ticker:
        by_ticker[ticker] = []
    by_ticker[ticker].append(price)

print(by_ticker)

from collections import defaultdict

by_ticker = defaultdict(list)
for ticker, price in trades:
    by_ticker[ticker].append(price)

print(by_ticker)

### two factories in action
trades = [('AAPL',150.00),('GOOG',2800.00),('AAPL',151.25),('MSFT',300.00),('GOOG',2795.00)]

trade_count = defaultdict(int)
for ticker, price in trades:
    trade_count[ticker] += 1

print(trade_count)

#####
fills = [("AAPL", "NYSE"), ("AAPL", "NASDAQ"), ("GOOG", "NASDAQ"), ("AAPL", "NYSE"), ("MSFT", "NYSE"), ("GOOG", "NASDAQ")]

exchanges = defaultdict(set)
for ticker, exchange in fills:
    exchanges[ticker].add(exchange)

print(dict(exchanges))


####
trade_count = defaultdict(int)
trade_count["AAPL"] = 5
trade_count["GOOG"] = 3

print(trade_count)

print(trade_count["TSLA"])
print(trade_count)
print(list(trade_count.keys()))

print(trade_count.get("TSLA", 0))
print(trade_count)
print(list(trade_count.keys()))

ratings = defaultdict(lambda: "hold")
ratings["AAPL"] = "buy"
ratings["GOOG"] = "sell"


print(ratings["AAPL"])
print(ratings["GOOG"])
print(ratings["NVDA"])

print(len(ratings))

