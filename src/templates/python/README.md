# {{project_name}}

{{description}}

## Getting Started

### Prerequisites

- Python >= 3.10
- pip >= 21.0

### Installation

```bash
# Create virtual environment
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Install in development mode
pip install -e ".[dev]"
```

### Usage

```bash
# Run the package
python -m {{project_name_kebab}}
```

### Development

```bash
# Run tests
pytest

# Format code
black .

# Type checking
mypy {{project_name_kebab}}

# Linting
ruff check .
```

## Author

{{author}}

## License

MIT
