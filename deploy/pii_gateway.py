from main import app as presidio
from service_auth import ServiceAuth

app = ServiceAuth(presidio)
