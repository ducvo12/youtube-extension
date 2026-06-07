def process_data(data: dict) -> dict:
    result = {
        "message": "Data processed successfully",
        "input": data,
        "output": f"Processed: {data.get('value', 'none')}"
    }
    return result
