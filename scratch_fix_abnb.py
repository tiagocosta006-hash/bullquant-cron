import sys
import asyncio
from scripts.ingest_fundamentals import process_company
import prisma

async def main():
    print("Ingesting ABNB...")
    await process_company("ABNB", "0001559720")
    print("Done")
    
if __name__ == "__main__":
    asyncio.run(main())
